// 인용 검증 실행 (F-005 AC2, DEC-009). P3 초안의 출처·본문 인용을 법제처 verify_citations로 재조회하고 최종 결과를 만든다.
// 재조회가 실패하면 검증할 수 없으므로 결과를 내보내지 않고 SEARCH_UPSTREAM_FAILED를 그대로 올린다 (F-006 AC2).
import "server-only";
import type { DemoDraft, StepEvent } from "@/lib/ai/policy";
import type { EvidenceSet } from "@/lib/search/evidence";
import { createLawSource, type LawSource } from "@/lib/search/law-source";
import type { CitationCheck } from "@/lib/search/types";
import { assembleResult, claimForKey, claimsInText, uniqueClaims, type Claim } from "./policy";

export const VERIFY_STEP_MESSAGE = "인용한 법령·판례를 법제처에 다시 확인하고 있어요";

export async function verifyDraft(
  draft: DemoDraft,
  evidence: EvidenceSet,
  deps: { lawSource?: LawSource; onStep?: (e: StepEvent) => void; screened?: number } = {},
) {
  const source = deps.lawSource ?? createLawSource({ timeoutMs: 8_000 });
  const sourceClaims: Claim[] = [];
  const textClaims: Claim[] = [];
  for (const p of draft.answer.points) {
    const c = claimForKey(p.source, evidence);
    if (c) sourceClaims.push(c);
    textClaims.push(...claimsInText(p.text, evidence).claims);
  }
  const { statutes, cases } = uniqueClaims([...sourceClaims, ...textClaims]);
  if (draft.answer.points.length > 0) {
    // 진행 단계에는 근거로 가져온 자료의 식별자만 보낸다 (본문에서 뽑은 미확인 인용은 재조회 전이라 보내지 않는다)
    const known = uniqueClaims(sourceClaims);
    deps.onStep?.({
      stage: "verify",
      message: VERIFY_STEP_MESSAGE,
      added: [...known.statutes, ...known.cases],
    });
  }

  const [statuteChecks, caseChecks] = await Promise.all([
    statutes.length ? source.verifyStatutes(statutes) : Promise.resolve([] as CitationCheck[]),
    cases.length ? source.verifyCases(cases) : Promise.resolve([] as CitationCheck[]),
  ]);
  const checks = new Map<string, CitationCheck>();
  for (const c of [...statuteChecks, ...caseChecks]) checks.set(c.citation, c);

  return assembleResult({ draft, evidence, checks, screened: deps.screened });
}
