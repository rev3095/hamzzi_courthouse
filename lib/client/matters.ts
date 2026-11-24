// 사건 진행 (F-016, DEC-053) — 브라우저에서 부르는 API. 화면(components/matters)은 이 모듈로만 서버를 부른다.
// 사건 자료는 서버(계정별)에 있고 브라우저 저장소에는 두지 않는다. 사진은 화면 메모리에만 있다.
import type { CompanyReport } from "@/lib/matters/policy";
import type { MatterData, MatterReading, MatterSource, MatterSummary } from "@/lib/matters/model";
import { call } from "./api";
import { attachmentBody, type BusinessLookup, type PreparedImage } from "./casefile";
import { readTier } from "./tier";

export type LoadedMatter = { id: string; title: string; updatedAt: string; data: MatterData };

type AiState<R extends string> = { used: true } | { used: false; reason: R };
type Common = "free_mode" | "budget" | "cost_cap" | "model_failed";

const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body) });

export const listMatters = () => call<{ items: MatterSummary[] }>("/api/v1/matters");
export const createMatter = (title: string, data?: MatterData) =>
  post<LoadedMatter>("/api/v1/matters", { title, ...(data && { data }) });
export const getMatter = (id: string) => call<LoadedMatter>(`/api/v1/matters/${id}`);
export const saveMatter = (id: string, patch: { title?: string; data?: MatterData }) =>
  call<{ id: string; updatedAt: string }>(`/api/v1/matters/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
export const deleteMatter = (id: string) =>
  call<{ deleted: true }>(`/api/v1/matters/${id}`, { method: "DELETE" });

export type MatterReadResult = {
  reading: MatterReading | null;
  /** 서류 속 법령 조문·사건번호 재조회 (개수만). removed = 확인되지 않아 가리거나 뺀 수 */
  citations: { checked: number; removed: number; failed: boolean } | null;
  ai: AiState<Common | "unreadable">;
  notice: string | null;
};
/** 화면에서 사진 전송·민감정보 처리 두 항목을 모두 동의한 뒤에만 부른다 */
export const readMatterDocs = async (images: PreparedImage[]) =>
  post<MatterReadResult>("/api/v1/matters/read", {
    ...(await attachmentBody(images)),
    consent: { images: true, sensitive: true },
  });

export type IssuesResult = {
  issues: { title: string; points: { text: string; label: string; url: string }[] }[];
  unknowns: string[];
  ai: AiState<"free_mode" | "budget">;
  notice: string | null;
};
/** matterId: 서버가 그 사건의 당사자 이름을 직접 모아 가린다. personNames는 아직 저장 전인 이름을 더할 뿐이다 */
export const organizeIssues = (matterId: string, text: string, personNames: string[]) =>
  post<IssuesResult>("/api/v1/matters/issues", {
    matterId,
    text,
    personNames,
    tier: readTier(),
    consent: true,
  });

export type CompanyResult = {
  report: CompanyReport | null;
  sources: MatterSource[];
  found: MatterSource[];
  unread: string[];
  official: {
    places: BusinessLookup["places"];
    corps: BusinessLookup["corps"];
    blogs: {
      status: "ok" | "empty" | "no_key" | "failed";
      items: { title: string; description: string; link: string | null }[];
    };
  };
  links: { label: string; url: string }[];
  ai: AiState<Common | "empty" | "person">;
  notice: string | null;
  sourceNotice: string;
};
export const researchCompany = (input: {
  matterId: string;
  name: string;
  /** 사용자가 "회사·기관 이름"이라고 확인함 — 표지 없는 이름은 이것 없이 서버가 거절한다 */
  isBusiness: boolean;
  urls: string[];
  pasted: string;
  personNames: string[];
  consent?: boolean;
}) => post<CompanyResult>("/api/v1/matters/company", input);

export type SummaryResult = {
  lines: string[];
  ai: AiState<Common | "empty">;
  notice: string | null;
};
export const summarizeText = (
  matterId: string,
  text: string,
  personNames: string[],
  consent = false,
) =>
  post<SummaryResult>("/api/v1/matters/summarize", {
    matterId,
    text,
    personNames,
    ...(consent && { consent: true }),
  });

/** AI를 쓰지 못한 이유를 사용자 문장으로 (서버 고정 값만 쓴다) */
export function aiSkipText(reason: string): string {
  if (reason === "free_mode") return "지금은 AI 기능이 꺼져 있어요. 직접 적어 넣을 수 있어요.";
  if (reason === "budget")
    return "이번 기간에 쓸 수 있는 AI 예산을 다 썼어요. 직접 적어 넣을 수 있어요.";
  if (reason === "cost_cap")
    return "한 번에 처리할 수 있는 양을 넘었어요. 양을 줄여 다시 해 주세요.";
  if (reason === "unreadable")
    return "사진에서 글자를 읽지 못했어요. 더 밝고 또렷한 사진으로 다시 올려 주세요.";
  if (reason === "empty") return "정리할 내용을 찾지 못했어요. 링크나 본문을 더해 다시 해 주세요.";
  if (reason === "person")
    return "사람을 가리키는 이름으로 보여 조사하지 않았어요. 회사·기관만 조사해요.";
  return "처리하는 중에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.";
}

/** 오류 응답을 사용자 문장으로 */
export function matterErrorText(code: string, reason?: unknown): string {
  if (code === "UNAUTHENTICATED") return "로그인이 필요해요.";
  if (code === "RATE_LIMITED") {
    return reason === "matter_ai_daily"
      ? "오늘 쓸 수 있는 AI 기능 횟수를 다 썼어요. 시간이 지난 뒤 다시 쓸 수 있어요."
      : "요청이 많아요. 잠시 뒤에 다시 해 주세요.";
  }
  if (code === "VALIDATION_ERROR") {
    if (reason === "too_many_matters")
      return "사건을 더 만들 수 없어요. 쓰지 않는 사건을 지워 주세요.";
    if (reason === "not_business")
      return "회사 이름만 조사할 수 있어요. 사람 이름은 조사하지 않아요.";
    if (reason === "confirm_business") return "회사·기관 이름이 맞는지 확인란에 표시해 주세요.";
    if (reason === "personal_site") return "개인 계정 사이트의 링크는 받지 않아요.";
    if (reason === "too_large") return "내용이 너무 커요. 오래된 노트를 지우거나 줄여 주세요.";
    return "입력한 내용을 확인해 주세요.";
  }
  if (code === "NOT_FOUND") return "사건을 찾지 못했어요.";
  return "문제가 생겼어요. 잠시 뒤에 다시 해 주세요.";
}
