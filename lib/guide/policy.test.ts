// 햄찌 안내 챗봇 고정 문안 검사 (DEC-030). 문안을 바꾸면 절대 규칙 2·3 위반과 끊긴 링크를 여기서 막는다.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { CASEFILE_LIMITS } from "@/lib/casefile/limits";
import { SEEDS } from "@/lib/community/policy";
import {
  ANON_IP_DAILY_LIMIT,
  ANON_QUESTION_LIMIT,
  USER_QUESTION_LIMIT,
} from "@/lib/inquiries/policy";
import { EXAMPLE_RATE, LOOKUP_RATE, SEARCH_RATE } from "@/lib/auth/rate-limit";
import { PROCEDURE_NOTICE } from "@/lib/procedure/steps";
import {
  GUIDE_LIMITS,
  GUIDE_NOTICE,
  GUIDE_TOPICS,
  guideEmail,
  guideTopic,
  MENU_IDS,
  type GuideTopic,
} from "./topics";

vi.mock("server-only", () => ({}));

const entries = Object.entries(GUIDE_TOPICS);
const textsOf = (t: GuideTopic) => [
  t.label,
  ...t.lines,
  ...(t.list ?? []),
  ...(t.links ?? []).map((l) => l.label),
];
const allTexts = entries.flatMap(([id, t]) => textsOf(t).map((s) => [id, s] as const));

/** 승패·가능성·유불리·위법 여부 판정 표현 (절대 규칙 2) + 변협 광고규정 금지 표현 (docs/research/03 L6) */
const JUDGING =
  /승률|승소|패소|이길|이깁|질\s*거|성공\s*(확률|가능)|가능성|확률|유리|불리|합법|적법|불법|위법(이|은|하지)?\s*아니|위반(이|은|하지)?\s*아니|문제(가)?\s*없|걸리지\s*않|안\s*걸|괜찮(아|습)|보장(합|해)|무료\s*상담|최저가|변호사\s*필요\s*없/;

describe("햄찌 안내 문안 (DEC-030)", () => {
  test("메뉴는 8개이고 모두 문안이 있다 (DEC-055로 변호사 연결 메뉴 폐기, DEC-057 전문 에이전트 추가)", () => {
    expect(MENU_IDS).toHaveLength(8);
    for (const id of MENU_IDS) expect(guideTopic(id), id).toBeDefined();
  });

  test("모든 항목에 근거 문서(source)와 답변 문단이 있다", () => {
    for (const [id, t] of entries) {
      expect(t.source.trim(), id).not.toBe("");
      expect(t.lines.length, id).toBeGreaterThan(0);
    }
  });

  test("하위 질문은 모두 있는 항목을 가리키고, 메뉴에서 닿지 않는 항목이 없다", () => {
    const reached = new Set<string>(MENU_IDS);
    for (const [id, t] of entries) {
      for (const n of t.next ?? []) {
        expect(guideTopic(n), `${id} → ${n}`).toBeDefined();
        expect(n, `${id} 자기 자신`).not.toBe(id);
        reached.add(n);
      }
    }
    for (const [id] of entries) expect(reached.has(id), id).toBe(true);
  });

  test("절대 규칙 2: 단정 표현(반드시·무조건·100% 등)이 없다", () => {
    for (const [id, s] of allTexts) expect(isAssertive(s), `${id}: ${s}`).toBe(false);
  });

  test("절대 규칙 2: 승률·승패·가능성·위법 여부를 판정하는 표현이 없다", () => {
    for (const [id, s] of allTexts) expect(JUDGING.test(s), `${id}: ${s}`).toBe(false);
  });

  test("변호사법 항목은 운영 사실(돈을 받지 않음, 배정·수수료 없음)만 말하고 자문 변호사 정보는 싣지 않는다 (DEC-055)", () => {
    const t = GUIDE_TOPICS["lawyer-act"];
    const list = t.list!.join(" ");
    expect(list).toContain("돈을 받지 않아요");
    expect(list).not.toMatch(/협업 변호사|자문을 받아/);
    expect(list).toContain("배정하지 않고");
    // 조항 이름은 docs/research/03 1-1절에 있는 것만
    const articles = GUIDE_TOPICS["lawyer-act-articles"].lines.join(" ");
    expect(articles.match(/제\d+조/g)?.sort()).toEqual(["제109조", "제34조"]);
  });

  test("앞으로의 계획은 계획으로만 말하고, 변호사 연결 항목은 없다 (DEC-055)", () => {
    expect(textsOf(GUIDE_TOPICS.roadmap).join(" ")).toMatch(/계획/);
    expect(Object.keys(GUIDE_TOPICS).filter((id) => id.startsWith("matching"))).toEqual([]);
  });

  test("요금제: 받는 요금이 없고 가격을 만들지 않는다", () => {
    const pricing = ["pricing", "pricing-future", "pricing-cost"].flatMap((id) =>
      textsOf(GUIDE_TOPICS[id]),
    );
    expect(pricing.join(" ")).toContain("요금을 받지 않아요");
    expect(pricing.join(" ")).toContain("유료로 바꿀 계획이 없어요");
    for (const s of pricing) expect(s, s).not.toMatch(/\d|\$|달러|만\s*원/);
  });

  test("기능 안내: 답변 모드는 요금제가 아니고 무료이며, 실제 모델 이름·유불리를 말하지 않는다 (DEC-036·041)", () => {
    const tiers = guideTopic("features-tiers")!.lines.join(" ");
    expect(tiers).toContain("요금제가 아니라");
    expect(tiers).toContain("무료");
    const features = [
      "features",
      "features-tiers",
      "features-deep",
      "features-examples",
      "features-procedure",
      "features-history",
      "features-casefile",
      "features-materials",
      "features-matters",
    ]
      .map((id) => guideTopic(id)!.lines.join(" "))
      .join(" ");
    // 화면에는 실제 모델 이름을 싣지 않는다 (TierSlider와 같은 기준)
    expect(features).not.toMatch(/Haiku|Sonnet|Opus|Claude/);
    // 모드별 정확도·품질을 약속하지 않는다
    expect(features).not.toMatch(/정확|더 좋은|더 나은|품질/);
    expect(guideTopic("features-deep")!.lines.join(" ")).toContain("판단하지 않아요");
    expect(guideTopic("features-deep")!.lines.join(" ")).toContain("질문 한 번으로");
  });

  test("기능 안내: 절차 안내는 검토 전 참고용 표시를 밝히고 결과를 판단하지 않는다 (DEC-021·042·043)", () => {
    const procedure = guideTopic("features-procedure")!.lines.join(" ");
    expect(procedure).toContain(PROCEDURE_NOTICE);
    expect(procedure).toContain("판단하지 않아요");
    expect(procedure).toContain("질문 문장은 저장하지 않아요");
  });

  test("절대 규칙 3: 숫자는 코드 상수·공식 기준 값뿐이다", () => {
    expect(GUIDE_LIMITS).toEqual({
      anonDaily: ANON_QUESTION_LIMIT,
      userDaily: USER_QUESTION_LIMIT,
      ipDaily: ANON_IP_DAILY_LIMIT,
      exampleHourly: EXAMPLE_RATE.limit,
      searchHourly: SEARCH_RATE.limit,
      lookupHourly: LOOKUP_RATE.limit,
      ipWindowHours: GUIDE_LIMITS.ipWindowHours,
      retentionDays: GUIDE_LIMITS.retentionDays,
      seedPost: SEEDS.post,
      seedComment: SEEDS.comment,
      casefileImages: CASEFILE_LIMITS.maxImages,
    });
    expect([EXAMPLE_RATE, SEARCH_RATE, LOOKUP_RATE].map((r) => r.windowSeconds)).toEqual([
      3600, 3600, 3600,
    ]);
    // 창 길이·보관 기간은 TS 상수가 없어(DB 함수·파기 배치) 개인정보처리방침 문구와 대조한다
    const privacy = readFileSync(path.join(process.cwd(), "app/privacy/page.tsx"), "utf8");
    expect(privacy).toContain(`${GUIDE_LIMITS.ipWindowHours}시간 안에 분석할 수 있는 횟수`);
    expect(privacy).toContain(`${GUIDE_LIMITS.retentionDays}일 동안 보관`);
    const allowed = new Set([
      ...Object.values(GUIDE_LIMITS).map(String),
      "1", // 1시간 (DEC-017·027)
      "0", // 한국 시간 0시 (DEC-024), 출시 기준 0건 (PRD 8.4)
      "109", // 변호사법 제109조 (docs/research/03)
      "34", // 변호사법 제34조 (docs/research/03)
    ]);
    for (const [id, s] of allTexts) {
      for (const n of s.match(/\d+/g) ?? [])
        expect(allowed.has(n), `${id}: ${n} in ${s}`).toBe(true);
    }
  });

  test("링크는 모두 사이트 안의 실제 페이지다", () => {
    const appDir = path.join(process.cwd(), "app");
    const resolves = (href: string) => {
      const [pathname] = href.split(/[?#]/);
      let dir = appDir;
      for (const seg of decodeURIComponent(pathname).split("/").filter(Boolean)) {
        const exact = path.join(dir, seg);
        if (existsSync(exact)) {
          dir = exact;
          continue;
        }
        const dynamic = readdirSync(dir, { withFileTypes: true }).find(
          (d) => d.isDirectory() && /^\[[^.\]]+\]$/.test(d.name),
        );
        if (!dynamic) return false;
        dir = path.join(dir, dynamic.name);
      }
      return existsSync(path.join(dir, "page.tsx"));
    };
    for (const [id, t] of entries) {
      for (const l of t.links ?? []) {
        expect(l.href, id).toMatch(/^\/(?!\/)/);
        expect(resolves(l.href), `${id}: ${l.href}`).toBe(true);
      }
    }
  });

  test("개발자 이메일은 연락처 항목에서만, 누를 때 합쳐서 보여 준다", () => {
    expect(guideEmail()).toMatch(/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]+$/);
    expect(entries.filter(([, t]) => t.contact).map(([id]) => id)).toEqual(["contact"]);
    for (const [id, s] of allTexts) expect(s, id).not.toContain("@");
  });

  test("분야별 비서 항목은 AI 답변이고 횟수에 들어간다고 밝힌다 (DEC-057)", () => {
    const t = GUIDE_TOPICS.assistants;
    expect(t.assistants).toBe(true);
    expect(t.lines.join(" ")).toContain("AI가");
    expect(t.lines.join(" ")).toContain("질문 한 번으로");
    expect(entries.filter(([, x]) => x.assistants).map(([id]) => id)).toEqual(["assistants"]);
  });

  test("절대 규칙 6: AI 생성물이 아니라는 고지를 단다", () => {
    expect(GUIDE_NOTICE).toBe("정해진 안내 · AI 생성 아님");
  });
});
