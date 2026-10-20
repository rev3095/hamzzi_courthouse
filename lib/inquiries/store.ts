import "server-only";

import { ApiError } from "@/lib/api/errors";
import type { RequestScope } from "@/lib/api/route";
import { ensureAnonSession, getAnonSessionId } from "@/lib/auth/anon";
import { getActor } from "@/lib/auth/server";
import type { InputScan } from "@/lib/pii";
import { clientIp, hashIp } from "@/lib/auth/ip";
import { createServiceClient } from "@/lib/supabase/server";
import {
  ANON_IP_DAILY_LIMIT,
  ANON_IP_WINDOW,
  ANON_QUESTION_LIMIT,
  type ConsumeResult,
  type Owner,
  type StoredPiiFindings,
  assertConsumed,
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

/**
 * 비로그인 분석 1회 소비 — 세션 3회·IP 해시 24시간 상한을 DB 함수가 원자적으로 확인한다 (DEC-010).
 * analyze 성공 직후 호출한다. 원본 IP는 여기서 해시로만 바꾸고 버린다.
 */
export async function consumeAnonQuestion(anonSessionId: string, headers: Headers) {
  const salt = process.env.ANON_IP_SALT;
  if (!salt && process.env.NODE_ENV === "production") {
    throw new Error("환경변수 ANON_IP_SALT이(가) 없습니다.");
  }
  const { data, error } = await createServiceClient().rpc("consume_anon_question", {
    p_session: anonSessionId,
    p_ip_hash: hashIp(clientIp(headers), salt),
    p_session_limit: ANON_QUESTION_LIMIT,
    p_ip_limit: ANON_IP_DAILY_LIMIT,
    p_window: ANON_IP_WINDOW,
  });
  if (error) throw new Error("consume_anon_question 실패");
  assertConsumed(data as ConsumeResult);
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
    .select("id, user_id, anon_session_id, status, pii_findings, sensitive_consent_at")
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
