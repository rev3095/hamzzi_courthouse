import "server-only";

import { ApiError } from "@/lib/api/errors";
import type { RequestScope } from "@/lib/api/route";
import { ensureAnonSession, getAnonSessionId } from "@/lib/auth/anon";
import { getActor } from "@/lib/auth/server";
import type { InputScan } from "@/lib/pii";
import { requestIpHash } from "@/lib/auth/ip";
import { createServiceClient } from "@/lib/supabase/server";
import {
  ANON_IP_DAILY_LIMIT,
  ANON_IP_WINDOW,
  ANON_IP_WINDOW_MS,
  ANON_QUESTION_LIMIT,
  type FinishResult,
  type Owner,
  type StoredPiiFindings,
  answerSummary,
  assertConsumed,
  finishedResultId,
  initialPiiFindings,
  isOwner,
} from "./policy";

export type { Owner } from "./policy";

// service_role로 쓰므로 소유권은 여기서 직접 확인한다 (RLS 우회 — DATA_MODEL 6절).

/** 요청자. 로그인 사용자 우선, 아니면 익명 세션. create면 익명 세션을 새로 만든다. */
export async function resolveOwner(
  scope: RequestScope,
  opts: { create: boolean },
): Promise<Owner | null> {
  const actor = await getActor(scope);
  if (actor) return { kind: "user", userId: actor.userId };
  const anonSessionId = opts.create ? await ensureAnonSession() : await getAnonSessionId();
  return anonSessionId ? { kind: "anon", anonSessionId } : null;
}

export type InquiryRow = {
  id: string;
  user_id: string | null;
  anon_session_id: string | null;
  status: "draft" | "need_info" | "analyzed" | "failed";
  pii_findings: StoredPiiFindings;
  sensitive_consent_at: string | null;
  masked_text: string;
  parent_inquiry_id: string | null;
};

const SENSITIVE_PURPOSE = "법률 정보 분석을 위한 민감정보 처리";

/** 비로그인 세션이 쓴 질문 수 (F-001 AC3). 세션이 없으면 0 */
export async function getAnonQuestionsUsed(anonSessionId: string): Promise<number> {
  const { data, error } = await createServiceClient()
    .from("anon_sessions")
    .select("questions_used")
    .eq("id", anonSessionId)
    .maybeSingle<{ questions_used: number }>();
  if (error) throw new Error("anon_sessions 조회 실패");
  return data?.questions_used ?? 0;
}

/** 비로그인 IP 해시 (원본 IP는 여기서 해시로만 바꾸고 버린다). production에서 솔트가 없으면 오류 */
const anonIpHash = (headers: Headers) => requestIpHash(headers);

/**
 * 모델을 부르기 전 IP 해시 24시간 상한 사전 검사 (DEC-010, 비용 남용 방지). 읽기만 한다 —
 * 최종 판정과 차감은 finishAnalysis(DB 함수 consume_anon_question)가 한다.
 */
export async function assertAnonIpAvailable(headers: Headers) {
  const ipHash = anonIpHash(headers);
  if (!ipHash) return;
  const since = new Date(Date.now() - ANON_IP_WINDOW_MS).toISOString();
  const { count, error } = await createServiceClient()
    .from("anon_usage")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gt("used_at", since);
  if (error) throw new Error("anon_usage 조회 실패");
  if ((count ?? 0) >= ANON_IP_DAILY_LIMIT) assertConsumed("ip_limit");
}

/** 마스킹본만 저장한다. 원문은 인자로도 받지 않는다 (DEC-006). */
export async function createInquiry(
  owner: Owner,
  scan: InputScan,
  sensitiveConsent: boolean,
  parentInquiryId: string | null = null,
) {
  const db = createServiceClient();
  const now = new Date();
  const consentAt = scan.sensitive.length && sensitiveConsent ? now.toISOString() : null;
  const { data, error } = await db
    .from("inquiries")
    .insert({
      user_id: owner.kind === "user" ? owner.userId : null,
      anon_session_id: owner.kind === "anon" ? owner.anonSessionId : null,
      masked_text: scan.maskedText,
      pii_findings: initialPiiFindings(scan.findings, now),
      sensitive_consent_at: consentAt,
      parent_inquiry_id: parentInquiryId,
      status: "draft",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error("inquiries 저장 실패");

  // 로그인 사용자의 민감정보 동의는 consents에도 남긴다 (철회·감사용). 비로그인은 inquiry의 시각만 남는다
  if (consentAt && owner.kind === "user") {
    const { error: consentError } = await db.from("consents").insert({
      user_id: owner.userId,
      kind: "sensitive_info",
      subject_id: data.id,
      purpose: SENSITIVE_PURPOSE,
      items: scan.sensitive,
      granted_at: consentAt,
    });
    if (consentError) {
      await db.from("inquiries").delete().eq("id", data.id);
      throw new Error("consents 저장 실패");
    }
  }
  return { id: data.id, status: "draft" as const };
}

/** 소유자만 읽는다. 없으면 404, 남의 것이면 403 (API.md 3절). */
export async function getOwnedInquiry(id: string, owner: Owner | null): Promise<InquiryRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError("NOT_FOUND");
  const { data, error } = await createServiceClient()
    .from("inquiries")
    .select(
      "id, user_id, anon_session_id, status, pii_findings, sensitive_consent_at, masked_text, parent_inquiry_id",
    )
    .eq("id", id)
    .maybeSingle<InquiryRow>();
  if (error) throw new Error("inquiries 조회 실패");
  if (!data) throw new ApiError("NOT_FOUND");
  if (!isOwner({ userId: data.user_id, anonSessionId: data.anon_session_id }, owner)) {
    throw new ApiError("FORBIDDEN");
  }
  return data;
}

export async function markPiiConfirmed(row: InquiryRow) {
  const piiFindings: StoredPiiFindings = {
    findings: row.pii_findings.findings,
    confirmedAt: row.pii_findings.confirmedAt ?? new Date().toISOString(),
  };
  const { error } = await createServiceClient()
    .from("inquiries")
    .update({ pii_findings: piiFindings })
    .eq("id", row.id);
  if (error) throw new Error("inquiries 갱신 실패");
}

/**
 * 이어 묻기 맥락: 앞선 질문 사슬을 거슬러 올라가 최근 3개(오래된 것부터)의 마스킹본과 답변 요약 (F-002 AC3, DEC-011).
 * 소유자가 다른 행을 만나면 멈춘다 (생성 시 확인하지만 한 번 더).
 */
export async function loadFollowupContext(
  parentId: string | null,
  owner: Owner,
  maxTurns = 3,
): Promise<{ question: string; answer: string }[]> {
  const db = createServiceClient();
  const turns: { question: string; answer: string }[] = [];
  let next = parentId;
  while (next && turns.length < maxTurns) {
    const { data, error } = await db
      .from("inquiries")
      .select("id, user_id, anon_session_id, masked_text, parent_inquiry_id")
      .eq("id", next)
      .maybeSingle<{
        id: string;
        user_id: string | null;
        anon_session_id: string | null;
        masked_text: string;
        parent_inquiry_id: string | null;
      }>();
    if (error) throw new Error("inquiries 조회 실패");
    if (!data || !isOwner({ userId: data.user_id, anonSessionId: data.anon_session_id }, owner)) {
      break;
    }
    const { data: result, error: resultError } = await db
      .from("analysis_results")
      .select("response")
      .eq("inquiry_id", data.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ response: unknown }>();
    if (resultError) throw new Error("analysis_results 조회 실패");
    turns.unshift({ question: data.masked_text, answer: answerSummary(result?.response) });
    next = data.parent_inquiry_id;
  }
  return turns;
}

export type FinishAnalysisInput = {
  inquiryId: string;
  result: { outcome: "grounded" | "no_result_in_scope" } & Record<string, unknown>;
  model: string;
  promptVersion: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
  stats: { total: number; removed: number };
  citations: {
    kind: "statute" | "case";
    claimedRef: string;
    status: "verified" | "unverified" | "removed";
    source: "law_open_api_live";
    sourceRef: string;
    quote: string | null;
  }[];
};

/**
 * 분석 마무리 — 비로그인 횟수 차감·결과 저장·인용 저장·analyzed 전환을 DB 함수 finish_demo_analysis 한 트랜잭션으로
 * (DEC-010, F-005). 같은 질문의 동시 요청은 행 잠금으로 직렬화돼 한 번만 차감되고, 저장이 실패하면 차감도 되돌아간다.
 * 판례 본문은 담지 않는다 — 결과의 인용 구절은 60자 이내 (DEC-007).
 */
export async function finishAnalysis(
  input: FinishAnalysisInput,
  owner: Owner,
  headers: Headers,
): Promise<string> {
  const { data, error } = await createServiceClient().rpc("finish_demo_analysis", {
    p_inquiry: input.inquiryId,
    p_anon_session: owner.kind === "anon" ? owner.anonSessionId : null,
    p_ip_hash: owner.kind === "anon" ? anonIpHash(headers) : null,
    p_session_limit: ANON_QUESTION_LIMIT,
    p_ip_limit: ANON_IP_DAILY_LIMIT,
    p_window: ANON_IP_WINDOW,
    p_response: input.result,
    p_outcome: input.result.outcome,
    p_model: input.model,
    p_prompt_version: input.promptVersion,
    p_tokens_in: input.usage.inputTokens,
    p_tokens_out: input.usage.outputTokens,
    p_latency_ms: input.latencyMs,
    p_citations_total: input.stats.total,
    p_citations_removed: input.stats.removed,
    p_citations: input.citations.map((c) => ({
      kind: c.kind,
      claimed_ref: c.claimedRef,
      status: c.status,
      source: c.source,
      source_ref: c.sourceRef,
      quote: c.quote,
    })),
  });
  if (error) throw new Error("finish_demo_analysis 실패");
  return finishedResultId(data as FinishResult);
}

/** 분석 실패 표시 (재시도 허용). 실패 처리 중 오류는 원래 오류를 가리지 않게 삼킨다 */
export async function markInquiryFailed(inquiryId: string) {
  try {
    // 같은 질문의 다른 요청이 이미 analyzed로 마쳤으면 덮어쓰지 않는다
    await createServiceClient()
      .from("inquiries")
      .update({ status: "failed" })
      .eq("id", inquiryId)
      .neq("status", "analyzed");
  } catch {
    // 원래 오류를 그대로 올린다
  }
}

/** 질문의 최신 분석 결과 (GET /inquiries/{id}/result). 검증을 통과해 저장된 결과만 있다 (F-005) */
export async function getLatestResult(
  inquiryId: string,
): Promise<{ id: string; response: unknown } | null> {
  const { data, error } = await createServiceClient()
    .from("analysis_results")
    .select("id, response")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; response: unknown }>();
  if (error) throw new Error("analysis_results 조회 실패");
  return data;
}
