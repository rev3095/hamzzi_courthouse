// 저장된 예시 답변 전체를 법제처 실호출로 다시 검증한다 (F-005, DEC-027). Claude 호출 없음 — 법제처 무료 조회만.
// 실행: pnpm test:live. 법이 개정돼 조문이 옮겨지거나 문구가 바뀌면 여기서 드러난다.
// 확인 (문단마다):
//   ① 인용 조문·판례 실존 (verify_citations / 사건번호 재조회)
//   ② 인용 구절이 지금 원문(조문 본문, 판례 판시사항·판결요지)에 글자 그대로 있음
//   ③ 문단 속 숫자(기간·금액)가 그 원문에 있음 — 절대 규칙 3
// 한 예시에서 여러 문제가 나와도 모두 보이도록 expect.soft로 모은다.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createLawSource } = await import("@/lib/search/law-source");
type Example = {
  id: string;
  result: {
    answer: { points: { text: string; source: string; quote: string; check?: string }[] };
    articles: { id: string; lawName: string; articleNo: string }[];
    cases: { id: string; caseNo: string }[];
  };
};
const examples = (
  (await import("@/lib/demo/examples.json")).default as unknown as { examples: Example[] }
).examples;

/** 운영 검증기(lib/citations/policy.ts)와 같게 NFKC·공백 차이만 무시한다 (예: ᆞ U+119E와 ㆍ U+318D는 같은 글자) */
const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
/** 문단 속 숫자 표현 (예: "7년", "1천만원", "500만원". "제1항" 같은 조문 번호는 뺀다) */
const amounts = (text: string) =>
  [...text.matchAll(/\d[\d,]*\s*(?:천만|백만|만)?\s*(?:원|년|개월|일|시간)/g)].map((m) =>
    squash(m[0]),
  );

describe.skipIf(!process.env.OPEN_LAW_API_KEY)("예시 답변 재검증 — 법제처 실호출 (F-005)", () => {
  const source = createLawSource({ timeoutMs: 30_000 });

  test("예시가 있다", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  for (const ex of examples) {
    test(
      `${ex.id}: 인용 실존 · 구절 원문 일치 · 숫자는 원문에서`,
      { timeout: 180_000 },
      async () => {
        const { points } = ex.result.answer;
        expect(points.length, `${ex.id} 문단 수`).toBeGreaterThan(0);
        for (const [i, p] of points.entries()) {
          const at = `${ex.id} ${i + 1}문단 ${p.source}`;
          expect.soft(p.check, `${at} 저장된 검증 상태`).toBe("verified");
          let body: string | null = null;
          if (p.source.startsWith("law:")) {
            const art = ex.result.articles.find((a) => a.id === p.source);
            expect.soft(art, `${at} 근거 목록에 있음`).toBeDefined();
            if (!art) continue;
            const [check] = await source.verifyStatutes([`${art.lawName} ${art.articleNo}`]);
            expect.soft(check?.exists, `${at} 실존`).toBe(true);
            const now = await source.getArticle(art.lawName, art.articleNo);
            expect.soft(now, `${at} 원문 조회`).not.toBeNull();
            body = now ? squash(now.text) : null;
          } else if (p.source.startsWith("case:")) {
            const c = ex.result.cases.find((x) => `case:${x.caseNo}` === p.source);
            expect.soft(c, `${at} 근거 목록에 있음`).toBeDefined();
            if (!c) continue;
            const [check] = await source.verifyCases([c.caseNo]);
            expect.soft(check?.exists, `${at} 실존`).toBe(true);
            const now = await source.getCase(c.id);
            expect.soft(now, `${at} 판례 조회`).not.toBeNull();
            body = now
              ? squash([now.holding, now.summary, now.bodyExcerpt].filter(Boolean).join(" "))
              : null;
          } else {
            expect.soft(p.source, `${at} 근거 키 형식`).toMatch(/^(law|case):/);
            continue;
          }
          if (!body) continue;
          expect.soft(body, `${at} 구절`).toContain(squash(p.quote));
          for (const n of amounts(p.text)) expect.soft(body, `${at} 숫자 ${n}`).toContain(n);
        }
      },
    );
  }
});
