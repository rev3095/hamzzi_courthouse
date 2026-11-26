// 사건 진행 (F-016, DEC-053) — DB 접근 (server-only, service_role). RLS를 우회하므로 소유권(user_id)을 모든 질의에 직접 건다.
// 사건 자료에는 본인 사건의 당사자 이름이 들어 있다 — 로그·오류에 내용을 남기지 않는다 (오류는 고정 문구).
import "server-only";
import { ApiError } from "@/lib/api/errors";
import type { RequestScope } from "@/lib/api/route";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { getActor } from "@/lib/auth/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  MATTER_LIMITS,
  autoStale,
  emptyMatter,
  readMatterData,
  type MatterData,
  type MatterSummary,
} from "./policy";

export type MatterUser = { userId: string; admin: boolean };

/** 사건 진행은 로그인 사용자만 쓴다. 비로그인은 401 UNAUTHENTICATED */
export async function requireMatterUser(scope: RequestScope): Promise<MatterUser> {
  const actor = await getActor(scope);
  if (!actor) throw new ApiError("UNAUTHENTICATED");
  return { userId: actor.userId, admin: await isAdminRequest() };
}

type Row = { id: string; title: string; data: unknown; updated_at: string };

const summaryOf = (r: Row): MatterSummary => {
  const d = readMatterData(r.data);
  return {
    id: r.id,
    title: r.title,
    updatedAt: r.updated_at,
    counts: {
      docs: d.docs.length,
      parties: d.parties.length,
      issues: d.issues.length,
      notes: d.notes.length,
    },
    field: d.auto?.field ?? null,
    gist: d.auto?.gist ?? "",
    summary: d.summary,
    stale: autoStale(d),
  };
};

export async function listMatters(userId: string): Promise<MatterSummary[]> {
  const { data, error } = await createServiceClient()
    .from("matters")
    .select("id, title, data, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MATTER_LIMITS.perUser)
    .returns<Row[]>();
  if (error) throw new Error("matters 조회 실패");
  return (data ?? []).map(summaryOf);
}

export async function createMatter(
  userId: string,
  title: string,
  data: MatterData = emptyMatter(),
): Promise<{ id: string; title: string; updatedAt: string; data: MatterData }> {
  const db = createServiceClient();
  const { count, error: countError } = await db
    .from("matters")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) throw new Error("matters 개수 조회 실패");
  if ((count ?? 0) >= MATTER_LIMITS.perUser) {
    throw new ApiError("VALIDATION_ERROR", {
      fields: ["title"],
      reason: "too_many_matters",
      limit: MATTER_LIMITS.perUser,
    });
  }
  const { data: row, error } = await db
    .from("matters")
    .insert({ user_id: userId, title, data })
    .select("id, title, data, updated_at")
    .single<Row>();
  if (error || !row) throw new Error("matters 저장 실패");
  return { id: row.id, title: row.title, updatedAt: row.updated_at, data };
}

/** 본인 사건만. 없거나 남의 것이면 404 (있는지 여부를 알려 주지 않는다) */
export async function getMatter(userId: string, id: string) {
  const { data, error } = await createServiceClient()
    .from("matters")
    .select("id, title, data, updated_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle<Row>();
  if (error) throw new Error("matters 조회 실패");
  if (!data) throw new ApiError("NOT_FOUND");
  return {
    id: data.id,
    title: data.title,
    updatedAt: data.updated_at,
    data: readMatterData(data.data),
  };
}

export async function saveMatter(
  userId: string,
  id: string,
  patch: { title?: string; data?: MatterData },
): Promise<{ id: string; updatedAt: string }>;
export async function saveMatter(
  userId: string,
  id: string,
  patch: { title?: string; data?: MatterData; ifUpdatedAt: string },
): Promise<{ id: string; updatedAt: string } | null>;
/** ifUpdatedAt을 주면 읽은 뒤 아무도 고치지 않았을 때만 저장하고, 그 사이 고쳐졌으면 null */
export async function saveMatter(
  userId: string,
  id: string,
  patch: { title?: string; data?: MatterData; ifUpdatedAt?: string },
): Promise<{ id: string; updatedAt: string } | null> {
  let query = createServiceClient()
    .from("matters")
    .update({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.data !== undefined && { data: patch.data }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (patch.ifUpdatedAt) query = query.eq("updated_at", patch.ifUpdatedAt);
  const { data, error } = await query
    .select("id, updated_at")
    .maybeSingle<{ id: string; updated_at: string }>();
  if (error) throw new Error("matters 저장 실패");
  if (!data) {
    if (patch.ifUpdatedAt) return null;
    throw new ApiError("NOT_FOUND");
  }
  return { id: data.id, updatedAt: data.updated_at };
}

/**
 * 자동 정리(DEC-070) 결과만 붙인다. 사용자가 고친 것이 아니라 목록 순서(updated_at)는 그대로 둔다.
 * 읽은 때(updatedAt)와 달라졌으면(그 사이 화면이 자료를 저장함) 덮어쓰지 않는다 — 화면이 받은 정리를 다음 저장 때 함께 보낸다.
 */
export async function saveMatterAuto(
  userId: string,
  id: string,
  patch: { title: string; data: MatterData; updatedAt: string },
): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("matters")
    .update({ title: patch.title, data: patch.data })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("updated_at", patch.updatedAt)
    .select("id");
  if (error) throw new Error("matters 저장 실패");
  return (data ?? []).length > 0;
}

export async function deleteMatter(userId: string, id: string): Promise<void> {
  const { data, error } = await createServiceClient()
    .from("matters")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) throw new Error("matters 삭제 실패");
  if (!data) throw new ApiError("NOT_FOUND");
}
