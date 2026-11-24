// 자료 첨부 (F-017, DEC-058) — 브라우저 쪽 판독 호출. 사진은 화면 메모리에만 있고 브라우저 저장소에 넣지 않는다.
// 사진 줄이기는 서류 분석과 같은 prepareImage(lib/client/casefile)를 쓴다.
import type { ErrorCode } from "@/lib/api/errors";
import { CASEFILE_LIMITS } from "@/lib/casefile/limits";
import type { MaterialReading } from "@/lib/materials/limits";
import type { PiiFinding } from "@/lib/pii";
import { call } from "./api";
import { attachmentBody, type PreparedImage } from "./casefile";

export type MaterialsAi =
  | { used: true }
  | { used: false; reason: "free_mode" | "budget" | "cost_cap" | "model_failed" | "unreadable" };

export type MaterialsReadResult = {
  materials: MaterialReading[];
  /** 검색 화면에서 고를 법률 용어 검색어 */
  queries: string[];
  piiFindings: PiiFinding[];
  sensitive: string[];
  dropped: number;
  ai: MaterialsAi;
  notice: string | null;
};

/** POST /materials/read — 화면에서 사진 전송·민감정보 처리 두 항목을 모두 동의한 뒤에만 부른다 */
export const readMaterials = async (images: PreparedImage[], question: string) =>
  call<MaterialsReadResult>("/api/v1/materials/read", {
    method: "POST",
    body: JSON.stringify({
      // 사진·PDF·문서 글 — 보내기 직전 전체 한도 안으로 다시 줄인다 (서류 분석과 같다)
      ...(await attachmentBody(images)),
      question: question.slice(0, CASEFILE_LIMITS.questionChars),
      consent: { images: true, sensitive: true },
    }),
  });

/** 판독 오류를 사용자 문장으로. 서버 고정 값만 쓰고 입력 내용은 넣지 않는다 */
export function materialsErrorText(code: ErrorCode, reason?: unknown): string {
  if (code === "VALIDATION_ERROR") {
    if (reason === "too_many")
      return `사진·문서는 ${CASEFILE_LIMITS.maxImages}개까지 올릴 수 있어요.`;
    if (reason === "too_large")
      return "사진이 너무 커요. 장수를 줄이거나 더 작은 사진으로 올려 주세요.";
    return "올릴 수 없는 파일이 있어요. 사진(JPG·PNG·WebP)·PDF·한글·워드·파워포인트·엑셀·텍스트 파일로 다시 올려 주세요.";
  }
  if (code === "RATE_LIMITED") {
    return reason === "casefile_hourly"
      ? "이 네트워크에서 사진 읽기를 많이 했어요. 잠시 뒤에 다시 해 주세요."
      : "오늘 쓸 수 있는 횟수를 다 썼어요.";
  }
  if (code === "LOGIN_REQUIRED") return "오늘 쓸 수 있는 질문 횟수를 다 썼어요.";
  return "자료를 읽는 중에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.";
}

export const MATERIALS_UNAVAILABLE: Record<Exclude<MaterialsAi, { used: true }>["reason"], string> =
  {
    free_mode:
      "지금은 AI 답변이 꺼져 있어서 사진을 읽을 수 없어요. 자료 내용을 글로 적어 물어봐 주세요.",
    budget:
      "이번 기간에 쓸 수 있는 AI 예산을 다 써서 사진을 읽을 수 없어요. 자료 내용을 글로 적어 물어봐 주세요.",
    cost_cap: "사진이 많거나 커서 한 번에 읽을 수 있는 양을 넘었어요. 장수를 줄여 다시 해 주세요.",
    model_failed: "자료를 읽는 중에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.",
    unreadable: "사진에서 내용을 알아보지 못했어요. 더 밝고 또렷한 사진으로 다시 올려 주세요.",
  };
