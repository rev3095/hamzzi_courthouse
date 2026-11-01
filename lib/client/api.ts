// 브라우저에서 부르는 API 도우미 (docs/API.md 2·4.1절). 화면(app/, components/)은 이 모듈로만 서버를 부른다.
// 입력 원문은 요청 본문으로만 보내고 저장하지 않는다. 브라우저에 남기는 것은 마스킹본뿐이다 (DEC-006).
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
}) => call<CreatedInquiry>("/api/v1/inquiries", { method: "POST", body: JSON.stringify(input) });

export const confirmPii = (id: string) =>
  call<{ id: string; status: string }>(`/api/v1/inquiries/${id}/pii-confirmation`, {
    method: "POST",
    body: JSON.stringify({ acceptMasked: true }),
  });

export const getResult = (id: string) => call<AnalyzedResult>(`/api/v1/inquiries/${id}/result`);

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
): Promise<ApiResult<AnalyzedResult>> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/inquiries/${id}/analyze`, {
      method: "POST",
      headers: { accept: "text/event-stream" },
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

export function rememberQuestion(id: string, maskedText: string, parentId?: string) {
  try {
    sessionStorage.setItem(QKEY(id), maskedText);
    if (parentId) sessionStorage.setItem(PKEY(id), parentId);
  } catch {
    // 저장소를 못 쓰면 질문 표시만 빠진다
  }
}

export function recallQuestion(id: string): { text: string | null; parentId: string | null } {
  try {
    return { text: sessionStorage.getItem(QKEY(id)), parentId: sessionStorage.getItem(PKEY(id)) };
  } catch {
    return { text: null, parentId: null };
  }
}

/** 남은 횟수 표시를 다시 읽게 한다 (헤더·홈) */
export const QUOTA_EVENT = "hz:quota";
export function notifyQuotaChanged() {
  window.dispatchEvent(new Event(QUOTA_EVENT));
}
