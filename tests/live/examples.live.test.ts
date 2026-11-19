// 저장된 예시 답변을 법제처 실호출로 다시 검증한다 (F-005, DEC-027). Claude 호출 없음 — 법제처 무료 조회만.
// 실행: pnpm test:live. 법이 개정돼 조문이 옮겨지거나 문구가 바뀌면 여기서 드러난다.
// 확인: ① 인용 조문 실존 ② 인용 구절이 지금 조문 원문에 글자 그대로 있음 ③ 답변 문단의 숫자가 그 조문 원문에 있음(절대 규칙 3)
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createLawSource } = await import("@/lib/search/law-source");
type Example = {
  id: string;
  result: {
    answer: { points: { text: string; source: string; quote: string; check?: string }[] };
    articles: { id: string; lawName: string; articleNo: string }[];
  };
};
const examples = (
  (await import("@/lib/demo/examples.json")).default as unknown as { examples: Example[] }
).examples;

/** 공백·줄바꿈 차이는 무시하고 비교한다 */
const squash = (s: string) => s.replace(/\s+/g, "");
/** 문단 속 숫자 표현 (예: "7년", "1천만원", "500만원", "제1항"은 조문 번호라 뺀다) */
const amounts = (text: string) =>
  [...text.matchAll(/\d[\d,]*\s*(?:천만|백만|만)?\s*(?:원|년|개월|일|시간)/g)].map((m) =>
    squash(m[0]),
  );

// 2026-11-19 재검증 대상: 검색 문제로 뺐다가 기본 조문으로 다시 만든 2건 + 인용 재조회 오탐을 고친 1건
const TARGETS = ["loan-01", "assault-01", "voice-phishing-01"];

describe.skipIf(!process.env.OPEN_LAW_API_KEY)("예시 답변 재검증 — 법제처 실호출 (F-005)", () => {
  const source = createLawSource({ timeoutMs: 30_000 });

  for (const id of TARGETS) {
    test(`${id}: 인용 조문 실존 · 구절 원문 일치 · 숫자는 조문 원문에서`, async () => {
      const ex = examples.find((e) => e.id === id);
      expect(ex, id).toBeDefined();
      const { points } = ex!.result.answer;
      expect(points.length).toBeGreaterThan(0);
      for (const p of points) {
        expect(p.check).toBe("verified");
        if (!p.source.startsWith("law:")) continue; // 판례는 사건번호 실존만 본다 (아래)
        const art = ex!.result.articles.find((a) => a.id === p.source);
        expect(art, p.source).toBeDefined();
        const [check] = await source.verifyStatutes([`${art!.lawName} ${art!.articleNo}`]);
        expect(check.exists, `${p.source} 실존`).toBe(true);
        const now = await source.getArticle(art!.lawName, art!.articleNo);
        expect(now, `${p.source} 원문`).not.toBeNull();
        const body = squash(now!.text);
        expect(body, `${p.source} 구절`).toContain(squash(p.quote));
        for (const n of amounts(p.text)) expect(body, `${p.source} 숫자 ${n}`).toContain(n);
      }
      const caseNos = points
        .filter((p) => p.source.startsWith("case:"))
        .map((p) => p.source.slice("case:".length));
      if (caseNos.length > 0) {
        const checks = await source.verifyCases(caseNos);
        expect(checks.map((c) => c.exists)).toEqual(caseNos.map(() => true));
      }
    });
  }
});
