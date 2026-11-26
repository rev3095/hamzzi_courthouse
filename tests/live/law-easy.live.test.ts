// 법령 쉬운 설명 미리 만들기 (DEC-074). **과금된다** — 법령마다 Haiku 1회.
// 예상 금액: 법령 수(목록의 국내 법령 + 추가분, 10개 안팎) × 1건 상한 $0.004 = 최대 약 $0.04 (실제는 입력 길이에 따라 그보다 적다). 서비스 기간·주간 예산 밖에서 과금된다.
// 실행(사용자 허락 뒤, 1회만): ALLOW_PAID_API=1 LAW_EASY_GEN=1 pnpm exec vitest run --config vitest.live.config.ts tests/live/law-easy.live.test.ts
//   LAW_EASY_ONLY=의료기기법,약사법  특정 법령만 · LAW_EASY_REDO=1  이미 있는 법령도 다시
// 결과는 lib/search/easy/data.json에 법령 하나씩 바로 쓴다(중간에 멈춰도 만든 것은 남는다).
// 가상 사례까지 만들어 두고, 보여 줄지는 그때의 실제 판례 수로 서버가 정한다. 저장된 문장도 보여 주기 전에 다시 거른다(lib/search/easy/data.ts).
// 법제처 조회(무료)에는 등록 IP·OPEN_LAW_API_KEY가 필요하다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { LAW_EASY_COST_CAP_USD } from "@/lib/ai/cost";
import type { EasyData } from "@/lib/search/easy/data";
import { catalogByCountry } from "@/lib/search/world/catalog";

vi.mock("server-only", () => ({}));
const { explainLaw, LAW_EASY_PROMPT_VERSION } = await import("@/lib/ai/law-easy");
const { createLawSource } = await import("@/lib/search/law-source");

/** 목록에 없어도 미리 만들어 둘 법령 (정식 이름) */
const EXTRA_LAWS = [
  "의료기기법",
  "의료기기법 시행령",
  "의료기기법 시행규칙",
  "체외진단의료기기법",
  "디지털의료제품법",
  "의료기기산업 육성 및 혁신의료기기 지원법",
  "약사법",
] as const;
/** 미리 만들 법령: 법령 탭 '의료기기 법령 한눈에'에 보이는 국내 법령 전부 + 위 목록 */
export const EASY_LAWS = [
  ...new Set([
    ...catalogByCountry()
      .filter((g) => g.country === "kr")
      .flatMap((g) => g.items.map((h) => h.title)),
    ...EXTRA_LAWS,
  ]),
];

const RUN =
  process.env.ALLOW_PAID_API === "1" &&
  process.env.LAW_EASY_GEN === "1" &&
  !!process.env.ANTHROPIC_API_KEY &&
  !!process.env.OPEN_LAW_API_KEY;

const ONLY = new Set((process.env.LAW_EASY_ONLY ?? "").split(",").filter(Boolean));
const REDO = process.env.LAW_EASY_REDO === "1";
const FILE = path.join(process.cwd(), "lib/search/easy/data.json");

const load = (): EasyData => JSON.parse(fs.readFileSync(FILE, "utf8")) as EasyData;
const save = (data: EasyData) => fs.writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);

describe.skipIf(!RUN)("법령 쉬운 설명 미리 만들기 (DEC-074)", () => {
  test(
    "법령마다 Haiku 1회로 만들고, 거르기를 통과한 것만 저장한다",
    async () => {
      const source = createLawSource({ timeoutMs: 20_000 });
      const data = load();
      let spent = 0;
      const failed: string[] = [];
      // 차례로 하나씩 — 실패해도 다시 부르지 않는다
      for (const name of EASY_LAWS) {
        if (ONLY.size > 0 && !ONLY.has(name)) continue;
        if (!REDO && data.laws[name]) continue;
        const law = await source.getLawArticles(name);
        if (!law) {
          failed.push(`${name}:not_found`);
          continue;
        }
        const articles = law.articles.map((a) => ({
          articleNo: a.articleNo,
          title: a.title,
          text: a.text,
        }));
        const out = await explainLaw({ lawName: law.lawName, articles, needVirtual: true });
        spent += out.costUsd;
        if (!out.ok) {
          failed.push(`${name}:${out.reason}`);
          continue;
        }
        // lawName은 열쇠로 두고 내용만 저장한다
        const { lawName: _lawName, ...easy } = out.easy;
        void _lawName;
        data.laws[law.lawName] = {
          promptVersion: LAW_EASY_PROMPT_VERSION,
          generatedAt: new Date().toISOString().slice(0, 10),
          easy,
        };
        save(data);
        // 문장은 찍지 않는다 — 수와 금액만
        console.info(
          JSON.stringify({
            law: law.lawName,
            articles: articles.length,
            keyPoints: easy.keyPoints.length,
            issues: easy.issues.length,
            virtualCases: easy.virtualCases.length,
            dropped: out.dropped,
            costUsd: Number(out.costUsd.toFixed(5)),
          }),
        );
      }
      console.info(JSON.stringify({ total: Number(spent.toFixed(4)), failed }));
      expect(spent).toBeLessThanOrEqual(EASY_LAWS.length * LAW_EASY_COST_CAP_USD + 1e-9);
    },
    10 * 60_000,
  );
});
