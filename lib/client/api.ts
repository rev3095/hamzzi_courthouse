// 브라우저에서 부르는 API 도우미 (docs/API.md 2·4.1절). 화면(app/, components/)은 이 모듈로만 서버를 부른다.
// 입력 원문은 요청 본문으로만 보내고 저장하지 않는다. 브라우저에 남기는 것은 마스킹본뿐이다 (DEC-006).
import { readTier } from "./tier";
import type { StepEvent } from "@/lib/ai/policy";
import type { ErrorCode, ErrorDetails } from "@/lib/api/errors";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import type { PiiFinding } from "@/lib/pii";

export type ClientError = {
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
  requestId?: string;
};

export type Quota = {
  anonymous: boolean;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  loginRequired: boolean;
  /** 관리자 모드(DEC-024): 질문 횟수 제한 없음 */
  admin: boolean;
  /** AI 답변이 켜져 있는지 (DEC-032). false면 답변 모드 선택을 숨긴다 */
  ai?: boolean;
};

export type CreatedInquiry = {
  id: string;
  status: string;
  piiFindings: PiiFinding[];
  maskedText: string;
  piiConfirmationRequired: boolean;
};

export type AnalyzedResult = { status: "analyzed"; resultId: string; result: DemoAnalysisResult };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ClientError };

const NETWORK_ERROR: ClientError = {
  code: "INTERNAL_ERROR",
  message: "서버에 연결하지 못했습니다.",
};

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
  const body = (await res.json().catch(() => null)) as { data: T } | { error: ClientError } | null;
  if (res.ok && body && "data" in body) return { ok: true, data: body.data };
  if (body && "error" in body) return { ok: false, error: body.error };
  return { ok: false, error: NETWORK_ERROR };
}

export const getQuota = () => call<Quota>("/api/v1/me/quota");

export const createInquiry = (input: {
  text: string;
  sensitiveConsent?: boolean;
  parentInquiryId?: string;
  /** 내 질문 기록에 남기기 (DEC-035). 로그인 사용자에게만 적용된다 */
  save?: boolean;
}) => call<CreatedInquiry>("/api/v1/inquiries", { method: "POST", body: JSON.stringify(input) });

export type SavedInquiry = {
  id: string;
  maskedText: string;
  status: string;
  createdAt: string;
  followup: boolean;
};

/** 내 질문 기록 (DEC-035, 로그인 필요) */
export const getMyInquiries = () => call<SavedInquiry[]>("/api/v1/me/inquiries");

export const confirmPii = (id: string) =>
  call<{ id: string; status: string }>(`/api/v1/inquiries/${id}/pii-confirmation`, {
    method: "POST",
    body: JSON.stringify({ acceptMasked: true }),
  });

export const getResult = (id: string) => call<AnalyzedResult>(`/api/v1/inquiries/${id}/result`);

/** 내 기록 삭제 (PRD 9.2). 비로그인은 바로 지우고 지운 질문 수를 돌려준다 */
export const deleteMyData = () =>
  call<{ status: "completed" | "received"; deletedInquiries?: number }>("/api/v1/me/data", {
    method: "DELETE",
  });

/** 이 탭에 둔 질문 마스킹본을 모두 지운다 (내 기록 삭제 뒤) */
export function forgetQuestions() {
  try {
    for (const k of Object.keys(sessionStorage))
      if (k.startsWith("hz:")) sessionStorage.removeItem(k);
    // 이 기기에 둔 조회 이력(DEC-029)도 함께 지운다
    localStorage.removeItem("hz:recent");
    localStorage.removeItem("hz:pins");
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
}

/** 도움 여부 피드백 (204, 본문 없음) */
export async function sendFeedback(
  resultId: string,
  body: { helpful: boolean; comment?: string },
): Promise<ApiResult<null>> {
  try {
    const res = await fetch(`/api/v1/results/${resultId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    if (res.status === 204) return { ok: true, data: null };
    const b = (await res.json().catch(() => null)) as { error?: ClientError } | null;
    return { ok: false, error: b?.error ?? NETWORK_ERROR };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

// --- 판례·조문 직접 검색 (F-003, F-004) ---------------------------------------------------
export type CaseRef = {
  id: string;
  caseNo: string;
  caseName: string;
  court: string;
  decidedAt: string | null;
  sourceUrl: string;
};
export type CaseList = {
  items: CaseRef[];
  outcome: "grounded" | "no_result_in_scope";
  searchScopeNote: string;
  notice: string;
};
export type CaseDetailView = CaseRef & {
  holdingSummary: string | null;
  sections: { section: string; text: string }[];
  fromBody: boolean;
  citedStatutes: { raw: string; id: string | null }[];
  notice: string;
};
export type StatuteView = {
  id: string;
  lawName: string;
  articleNo: string;
  articleTitle: string;
  effectiveFrom: string | null;
  sourceUrl: string;
  body: string;
  isCurrent: boolean;
  asOf?: string;
  versionAtDate?: { effectiveFrom: string | null } | null;
  asOfNote?: string;
  notice: string;
};

/** 검색어는 본문으로 보낸다 — 주소·접속 기록에 남지 않게 (F-007) */
export const searchCases = (q: string) =>
  call<CaseList>("/api/v1/cases", { method: "POST", body: JSON.stringify({ q }) });
export const getCaseDetail = (id: string) =>
  call<CaseDetailView>(`/api/v1/cases/${encodeURIComponent(id)}`);
export const getStatute = (id: string, asOf?: string) =>
  call<StatuteView>(
    `/api/v1/statutes/${encodeURIComponent(id)}${asOf ? `?${new URLSearchParams({ asOf })}` : ""}`,
  );

// --- 탐색 확장 (DEC-029 제안): 결정문·시점 조문·법령 도구·자치법규 ---------------------------
export type DecisionDomain = import("@/lib/search/types").DecisionDomain;
export type DecisionRef = {
  domain: DecisionDomain;
  id: string;
  title: string;
  refNo: string | null;
  agency: string | null;
  decidedAt: string | null;
  dateLabel: string;
  hasDetail: boolean;
  sourceUrl: string | null;
  agencySite?: { label: string; url: string } | null;
};
export type Listed<T> = {
  items: T[];
  outcome: "grounded" | "no_result_in_scope";
  searchScopeNote: string;
  notice: string;
};
export type DecisionDetailView = DecisionRef & {
  sections: { section: string; text: string }[];
  fromBody: boolean;
  notice: string;
};
export type LawVersionView = {
  mst: string;
  lawName: string;
  effectiveFrom: string | null;
  promulgatedAt: string | null;
  promulgationNo: string | null;
  revisionType: string | null;
};
export type DiffPart = { type: "same" | "removed" | "added"; text: string };
export type StatuteAtDate = {
  lawName: string;
  articleNo: string;
  articleTitle: string;
  body: string;
  effectiveFrom: string | null;
  version: LawVersionView;
  sameAsCurrent: boolean;
  diff: DiffPart[];
};
export type StatuteTimeView = StatuteView & {
  atDate?: StatuteAtDate | null;
  atDateVersion?: LawVersionView;
};
type LawBase = { lawName: string; sourceUrl: string; notice: string };
export type ThreeTierView = LawBase & {
  rows: {
    articleNo: string;
    title: string;
    text: string;
    delegations: {
      type: string;
      lawName: string;
      articleNo: string | null;
      title: string;
      text: string;
    }[];
  }[];
};
export type OldNewRow = { no: number; text: string; changed: string[] };
export type OldNewView = LawBase & {
  old: LawVersionView | null;
  new: LawVersionView | null;
  oldRows: OldNewRow[];
  newRows: OldNewRow[];
};
export type HistoryView = LawBase & { versions: LawVersionView[] };
export type AnnexView = LawBase & {
  items: {
    no: string | null;
    title: string;
    kind: string | null;
    fileUrl: string | null;
    pdfUrl: string | null;
  }[];
};
export type ImpactView = LawBase & {
  articleCount: number;
  lower: {
    articleNo: string;
    title: string;
    delegations: { type: string; lawName: string; articleNo: string | null; title: string }[];
  }[];
  ordinances: {
    lawName: string;
    lawArticleNo: string | null;
    ordinanceId: string;
    ordinanceName: string;
    ordinanceArticleNo: string | null;
  }[];
  checks: { articleNo: string; title: string; phrase: string; linked: number }[];
  impactNote: string;
  delegationNote: string;
};
export type OrdinanceRef = {
  id: string;
  name: string;
  region: string | null;
  kind: string | null;
  effectiveFrom: string | null;
  promulgatedAt: string | null;
  sourceUrl: string;
};
export type OrdinanceView = OrdinanceRef & {
  articles: { articleNo: string | null; title: string; text: string }[];
  notice: string;
};
export type AdminRuleRef = {
  id: string;
  name: string;
  kind: string | null;
  agency: string | null;
  issuedAt: string | null;
  effectiveFrom: string | null;
  sourceUrl: string;
};

const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body) });

export const searchDecisions = (domain: DecisionDomain, q: string) =>
  post<Listed<DecisionRef> & { domain: DecisionDomain }>("/api/v1/decisions", { domain, q });
export const getDecision = (domain: string, id: string) =>
  call<DecisionDetailView>(
    `/api/v1/decisions/${encodeURIComponent(domain)}/${encodeURIComponent(id)}`,
  );
export const searchOrdinances = (q: string) =>
  post<Listed<OrdinanceRef>>("/api/v1/ordinances", { q });
export const getOrdinance = (id: string) =>
  call<OrdinanceView>(`/api/v1/ordinances/${encodeURIComponent(id)}`);
export const searchAdminRules = (q: string) =>
  post<Listed<AdminRuleRef>>("/api/v1/admin-rules", { q });
export const getStatuteCases = (id: string) =>
  call<Listed<CaseRef>>(`/api/v1/statutes/${encodeURIComponent(id)}/cases`);
export const getStatuteAt = (id: string, asOf?: string) =>
  getStatute(id, asOf) as Promise<ApiResult<StatuteTimeView>>;

export type LawViews = {
  articles: LawBase & {
    articles: { articleNo: string; title: string; text: string; effectiveFrom: string | null }[];
  };
  "three-tier": ThreeTierView;
  "old-new": OldNewView;
  history: HistoryView;
  annexes: AnnexView;
  impact: ImpactView;
};
export const getLawView = <K extends keyof LawViews>(lawName: string, view: K, mst?: string) =>
  call<LawViews[K]>(
    `/api/v1/laws/${encodeURIComponent(lawName)}/${view}${mst ? `?${new URLSearchParams({ mst })}` : ""}`,
  );

/** SSE 한 덩어리("event: …\ndata: …")를 읽는다. 형식이 다르면 null */
export function parseSseBlock(block: string): { event: string; data: unknown } | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

/** POST /inquiries/{id}/analyze (Accept: text/event-stream). step을 받을 때마다 onStep, 끝에 결과 또는 오류 */
export async function analyzeStream(
  id: string,
  onStep: (e: StepEvent) => void,
  category?: string | null,
): Promise<ApiResult<AnalyzedResult>> {
  let res: Response;
  try {
    // 홈에서 고른 카테고리(DEC-028)는 무료 판례 검색에 고정 검색어 하나를 더하는 데만 쓴다. 정해진 값만 서버가 받는다
    // 답변 단계(DEC-032)는 이 기기에서 고른 값. 서버가 세 값 중 하나인지 확인한다
    res = await fetch(`/api/v1/inquiries/${id}/analyze`, {
      method: "POST",
      headers: { accept: "text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({
        tier: readTier(),
        ...(category && { category }),
        ...(recallDeep(id) && { deep: true }),
      }),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
  // 스트림을 열기 전 오류(401·409·422·429 등)는 일반 JSON 오류 응답이다
  if (!res.ok || !res.headers.get("content-type")?.includes("text/event-stream") || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: ClientError } | null;
    return { ok: false, error: body?.error ?? NETWORK_ERROR };
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    let chunk: ReadableStreamReadResult<string>;
    try {
      chunk = await reader.read();
    } catch {
      return { ok: false, error: NETWORK_ERROR };
    }
    if (chunk.done) break;
    buffer += chunk.value.replace(/\r\n/g, "\n");
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const parsed = parseSseBlock(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
      if (!parsed) continue;
      if (parsed.event === "step") onStep(parsed.data as StepEvent);
      else if (parsed.event === "result") return { ok: true, data: parsed.data as AnalyzedResult };
      else if (parsed.event === "error") return { ok: false, error: parsed.data as ClientError };
    }
  }
  return { ok: false, error: NETWORK_ERROR };
}

// --- 브라우저 보관 (마스킹본만) -------------------------------------------------------
// 결과 화면 맨 위 질문 표시와 이어 묻기 스레드용. 서버 응답에는 질문 문장이 없어서 이 기기에만 둔다.
const QKEY = (id: string) => `hz:q:${id}`;
const PKEY = (id: string) => `hz:p:${id}`;
const CKEY = (id: string) => `hz:c:${id}`;
const DKEY = (id: string) => `hz:d:${id}`;

/** DeepSearch로 보낸 질문 표시 (DEC-034). 개인정보가 아닌 표시 하나만 이 기기에 둔다 */
export function rememberDeep(id: string) {
  try {
    sessionStorage.setItem(DKEY(id), "1");
  } catch {
    // 저장소를 못 쓰면 일반 질문으로 분석된다
  }
}

export function recallDeep(id: string): boolean {
  try {
    return sessionStorage.getItem(DKEY(id)) === "1";
  } catch {
    return false;
  }
}

export function rememberQuestion(
  id: string,
  maskedText: string,
  parentId?: string,
  category?: string | null,
) {
  try {
    sessionStorage.setItem(QKEY(id), maskedText);
    if (parentId) sessionStorage.setItem(PKEY(id), parentId);
    // 카테고리(DEC-028)는 개인정보가 아닌 정해진 값이다. 이어 묻기는 앞 질문의 카테고리를 물려받는다
    const cat = category ?? (parentId ? sessionStorage.getItem(CKEY(parentId)) : null);
    if (cat) sessionStorage.setItem(CKEY(id), cat);
  } catch {
    // 저장소를 못 쓰면 질문 표시만 빠진다
  }
}

export function recallQuestion(id: string): {
  text: string | null;
  parentId: string | null;
  category: string | null;
} {
  try {
    return {
      text: sessionStorage.getItem(QKEY(id)),
      parentId: sessionStorage.getItem(PKEY(id)),
      category: sessionStorage.getItem(CKEY(id)),
    };
  } catch {
    return { text: null, parentId: null, category: null };
  }
}

/** 남은 횟수 표시를 다시 읽게 한다 (헤더·홈) */
export const QUOTA_EVENT = "hz:quota";
export function notifyQuotaChanged() {
  window.dispatchEvent(new Event(QUOTA_EVENT));
}
