// 앱의 온라인 연결 (DEC-048·049). 햄찌법원 웹과 같은 API(/api/v1)를 부른다 — 하루 횟수·금액 상한·인용 검증은 서버가 그대로 맡는다.
// - 기기 앱(Capacitor)에서는 CapacitorHttp가 fetch를 기기 통신으로 바꿔 사이트 API에 닿는다.
// - 미리보기(웹 게시본 등 바깥 주소로 통신이 막힌 곳)에서는 연결 확인이 실패하고, 화면은 기기 안 자료(규칙 판독·검증된 예시)로 동작한다.
// - 질문은 요청 본문으로만 보내고 주소(URL)·기기 저장소에 남기지 않는다. 비밀번호도 본문으로만 보낸다.
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import type {
  BoardKey,
  CommentView,
  PostSummary,
  PostView,
  SeedSummary,
} from "@/lib/community/policy";
import { WEB_URL } from "@/lib/reader/source";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
/** 개발 서버에서는 VITE_API_BASE=/api/v1 로 프록시를 쓴다 (mobile/vite.config.ts) */
export const API_BASE = env.VITE_API_BASE || `${WEB_URL}/api/v1`;

export type ApiError = { code: string; message: string; details?: Record<string, unknown> };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const OFFLINE: ApiError = { code: "NETWORK", message: "서버에 연결하지 못했어요." };

async function call<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 20_000,
): Promise<ApiResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", accept: "application/json", ...init?.headers },
      credentials: "include",
      signal: ctrl.signal,
    });
    if (res.status === 204) return { ok: true, data: null as T };
    const body = (await res.json().catch(() => null)) as { data?: T; error?: ApiError } | null;
    if (res.ok && body && "data" in body) return { ok: true, data: body.data as T };
    if (body?.error) return { ok: false, error: body.error };
    return { ok: false, error: OFFLINE };
  } catch {
    return { ok: false, error: OFFLINE };
  } finally {
    clearTimeout(timer);
  }
}

const post = <T>(path: string, body?: unknown, timeoutMs?: number) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }, timeoutMs);

/** 서버에 닿는지 한 번 확인한다. 닿지 않으면 화면은 기기 안 자료로 동작한다 */
export async function probe(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    // 상태 점검 응답은 { data } 모양이 아니라 응답 코드만 본다
    const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ── 질문 (F-001~F-006) ────────────────────────────────────────
export type Tier = "light" | "pro" | "max";
export const TIER_LABEL: Record<Tier, { name: string; hint: string }> = {
  light: { name: "Light", hint: "빠르게" },
  pro: { name: "Pro", hint: "기본" },
  max: { name: "Pro Max", hint: "깊게" },
};

export type Quota = {
  anonymous: boolean;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  loginRequired: boolean;
  admin: boolean;
  ai?: boolean;
};
export const getQuota = () => call<Quota>("/me/quota");

type Created = {
  id: string;
  maskedText: string;
  piiFindings: { type: string }[];
  piiConfirmationRequired: boolean;
};
export type Analyzed = { status: string; resultId: string; result: DemoAnalysisResult };

export const createInquiry = (text: string, sensitiveConsent = false) =>
  post<Created>("/inquiries", { text, ...(sensitiveConsent && { sensitiveConsent: true }) });
export const confirmPii = (id: string) =>
  post<{ id: string }>(`/inquiries/${id}/pii-confirmation`, { acceptMasked: true });
/** 분석은 한 번만 부른다 (재시도 없음 — 이중 과금 방지). 답변까지 시간이 걸려 기다리는 시간을 길게 둔다 */
export const analyze = (
  id: string,
  opts: { tier: Tier; category?: string | null; deep?: boolean },
) =>
  post<Analyzed>(
    `/inquiries/${id}/analyze`,
    {
      tier: opts.tier,
      ...(opts.category && { category: opts.category }),
      ...(opts.deep && { deep: true }),
    },
    120_000,
  );

// ── 판례·법령 탐색 (F-003·F-004, DEC-029) ─────────────────────
export type CaseRef = {
  id: string;
  caseNo: string;
  caseName: string;
  court: string;
  decidedAt: string | null;
  sourceUrl: string;
};
export type Listed<T> = { items: T[]; outcome: string; searchScopeNote: string; notice: string };
export type CaseDetail = CaseRef & {
  holdingSummary: string | null;
  sections: { section: string; text: string }[];
  notice: string;
};
export type LawArticles = {
  lawName: string;
  sourceUrl: string;
  notice: string;
  articles: { articleNo: string; title: string; text: string; effectiveFrom: string | null }[];
};
export type DecisionRef = {
  domain: string;
  id: string;
  title: string;
  refNo: string | null;
  agency: string | null;
  decidedAt: string | null;
  sourceUrl: string | null;
};
export type OrdinanceRef = { id: string; name: string; region: string | null; sourceUrl: string };
export type AdminRuleRef = { id: string; name: string; agency: string | null; sourceUrl: string };

export const searchCases = (q: string) => post<Listed<CaseRef>>("/cases", { q });
export const getCase = (id: string) => call<CaseDetail>(`/cases/${encodeURIComponent(id)}`);
export const getLawArticles = (lawName: string) =>
  call<LawArticles>(`/laws/${encodeURIComponent(lawName)}/articles`);
export const searchDecisions = (domain: string, q: string) =>
  post<Listed<DecisionRef>>("/decisions", { domain, q });
export const searchOrdinances = (q: string) => post<Listed<OrdinanceRef>>("/ordinances", { q });
export const searchAdminRules = (q: string) => post<Listed<AdminRuleRef>>("/admin-rules", { q });

// ── 커뮤니티·씨앗 (DEC-047) ───────────────────────────────────
export type PostDraft = {
  board: BoardKey;
  title: string;
  body: string;
  nickname: string;
  password?: string;
  sensitiveConsent?: boolean;
};
export const listPosts = (board: BoardKey | null) =>
  call<{ items: PostSummary[]; nextCursor?: string }>(
    `/community/posts${board ? `?board=${board}` : ""}`,
  );
export const getPost = (id: string) =>
  call<{ post: PostView; comments: CommentView[] }>(`/community/posts/${id}`);
export const createPost = (d: PostDraft) =>
  post<{ post: PostView; masked: number; seeds: number }>("/community/posts", d);
export const deletePost = (id: string, password?: string) =>
  call<{ deleted: boolean }>(`/community/posts/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
export const createComment = (
  postId: string,
  d: { body: string; nickname: string; password?: string; sensitiveConsent?: boolean },
) =>
  post<{ comment: CommentView; masked: number; seeds: number }>(
    `/community/posts/${postId}/comments`,
    d,
  );
export const reportPost = (id: string) =>
  post<{ reported: boolean }>(`/community/posts/${id}/report`);
export const getSeeds = () => call<SeedSummary>("/me/seeds");

/** 오류를 화면 문장으로. 서버 메시지는 고정 문구라 입력이 섞이지 않는다 */
export function errorText(e: ApiError): string {
  const reason = e.details?.reason;
  if (e.code === "NETWORK") return "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.";
  if (e.code === "LOGIN_REQUIRED") return "오늘 쓸 수 있는 질문을 모두 썼어요. 내일 다시 채워져요.";
  if (e.code === "RATE_LIMITED" && reason === "user_daily")
    return "오늘 쓸 수 있는 질문을 모두 썼어요. 내일 다시 채워져요.";
  if (e.code === "RATE_LIMITED") return "요청이 많아요. 잠시 뒤에 다시 해 주세요.";
  if (e.code === "FORBIDDEN" && reason === "wrong_password") return "비밀번호가 맞지 않아요.";
  if (e.code === "FORBIDDEN") return "이 글을 쓴 계정으로 로그인해야 해요.";
  if (e.code === "NOT_FOUND") return "찾을 수 없어요.";
  if (e.code === "VALIDATION_ERROR") return "입력을 다시 확인해 주세요. 너무 짧거나 길 수 있어요.";
  if (e.code === "EMPTY_INPUT") return "내용을 적어 주세요.";
  return e.message || "잠시 뒤에 다시 해 주세요.";
}
