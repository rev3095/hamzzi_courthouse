// 서류 분석 예시 (F-015, DEC-052) — 순수 규칙. 직접 쓴 가상 서류 그림을 실제 서류 분석과 같은 길(판독 → 확인한 개요 →
// DeepSearch → 인용 검증)로 미리 분석해 둔 결과를 그대로 보여 준다(scripts/gen-casefile-examples.mjs → merge-casefile-examples.mjs).
// 화면(/casefile/examples/[id])은 빌드 때 렌더링하고 Claude·법제처·DB·질문 횟수 차감이 없다.
import { AI_NOTICE } from "@/lib/api/respond";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import data from "./examples.json";
import type { CaseReading, MySide } from "./limits";

export type CaseFileExample = {
  id: string;
  title: string;
  /** real-form: 실제 서면의 양식·쓰는 방식만 따라 새로 쓴 가상 서류 / virtual: 처음부터 지어 쓴 가상 서류 */
  basis: "real-form" | "virtual";
  mySide: MySide;
  /** public 아래 서류 그림 주소 */
  image: string;
  width: number;
  height: number;
  /** 질문창에 적은 글 */
  userQuestion: string;
  /** 서버가 가린 판독 결과 (개인 이름 없음) */
  reading: CaseReading;
  /** 판독 개요와 질문을 합쳐 분석에 보낸 문장 (가린 것) */
  question: string;
  result: DemoAnalysisResult;
};

const EXAMPLES = (data as unknown as { examples: CaseFileExample[] }).examples;

export const CASEFILE_EXAMPLE_NOTE =
  "직접 쓴 가상 서류를 실제 서류 분석과 같은 순서(서류 읽기 → 읽은 내용 확인 → 쟁점별 근거 찾기 → 인용 확인)로 미리 분석해 둔 예시예요. 저장된 결과를 바로 보여 드려서 질문 횟수에 포함되지 않아요.";

export const CASEFILE_REPLAY_NOTE =
  "미리 분석해 둔 서류 분석 예시의 답변입니다. 국가법령정보센터(법제처)에서 찾은 현행 법령 조문과 판례만 근거로 썼고, 인용은 법제처 재조회로 확인했습니다.";

export const BASIS_LABEL: Record<CaseFileExample["basis"], string> = {
  "real-form": "실제 서면 양식",
  virtual: "가상 사건",
};

export const casefileExamples = (): CaseFileExample[] => EXAMPLES;

export const casefileExampleHref = (id: string) => `/casefile/examples/${id}`;

export function casefileExampleById(id: string): CaseFileExample | null {
  return EXAMPLES.find((e) => e.id === id) ?? null;
}

/** 재생 결과 — 저장된 분석에 재생 표시와 안내만 바꿔 붙인다 */
export function casefileReplayResult(e: CaseFileExample): DemoAnalysisResult {
  return {
    ...e.result,
    mode: "replay",
    aiNotice: AI_NOTICE,
    searchScopeNote: CASEFILE_REPLAY_NOTE,
  };
}
