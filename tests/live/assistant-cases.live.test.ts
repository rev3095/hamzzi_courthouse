// 분야별 비서 사례 자료(lib/assistants/cases.ts)의 공개 판례가 법제처에 실제로 있는지 확인한다 (DEC-057, 무료 조회).
// 실행: pnpm test:live. 사건번호·법원·선고일이 저장한 값과 다르거나 조회되지 않으면 여기서 드러난다.
// 비서 고정 조문(lawHints)과 사례의 관련 조문도 함께 확인한다.
import { describe, expect, test, vi } from "vitest";
import { ASSISTANT_LIST } from "@/lib/assistants/agents";
import { ASSISTANT_CASES } from "@/lib/assistants/cases";

vi.mock("server-only", () => ({}));
const { createLawSource } = await import("@/lib/search/law-source");

const compact = (s: string) => s.replace(/\s/g, "");

describe.skipIf(!process.env.OPEN_LAW_API_KEY)("비서 사례 자료 실존 (DEC-057)", () => {
  const source = createLawSource({ timeoutMs: 30_000 });

  test("공개 판례의 사건번호·법원·선고일이 법제처 조회 결과와 같다", async () => {
    const problems: string[] = [];
    for (const c of ASSISTANT_CASES) {
      if (c.kind !== "precedent") continue;
      const d = await source.getCase(c.precId);
      if (!d) problems.push(`${c.id}: 조회 안 됨`);
      else {
        if (!compact(d.caseNo).includes(compact(c.caseNo)))
          problems.push(`${c.id}: 사건번호 ${d.caseNo}`);
        if (compact(d.court) !== compact(c.court)) problems.push(`${c.id}: 법원 ${d.court}`);
        if (d.decidedAt && d.decidedAt.slice(0, 10) !== c.decidedAt)
          problems.push(`${c.id}: 선고일 ${d.decidedAt}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("비서 고정 조문과 사례의 관련 조문이 그 법령에 있다", async () => {
    const wanted = new Map<string, [string, string]>();
    for (const a of ASSISTANT_LIST)
      for (const h of a.lawHints)
        for (const no of h.articleNos) wanted.set(`${h.lawName} ${no}`, [h.lawName, no]);
    for (const c of ASSISTANT_CASES)
      for (const l of c.laws) wanted.set(`${l.lawName} ${l.articleNo}`, [l.lawName, l.articleNo]);
    const problems: string[] = [];
    for (const [id, [law, no]] of wanted) {
      const a = await source.getArticle(law, no);
      if (!a) problems.push(`${id}: 조문 없음`);
      else if (compact(a.lawName) !== compact(law)) problems.push(`${id}: 다른 법령 ${a.lawName}`);
    }
    expect(problems).toEqual([]);
  });
});
