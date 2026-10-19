import "server-only";

import { ApiError } from "@/lib/api/errors";
import type { RequestScope } from "@/lib/api/route";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";

export type Role = "user" | "lawyer" | "admin";
export type Actor = { userId: string; role: Role };

/** 로그인 사용자와 역할. 비로그인이면 null. 역할은 서버가 profiles에서 읽는다(토큰·클라이언트 값 신뢰 안 함). */
export async function getActor(scope: RequestScope): Promise<Actor | null> {
  const { data } = await (await createUserClient()).auth.getUser();
  const userId = data.user?.id;
  if (!userId) return null;
  scope.setUser(userId);
  const { data: profile, error } = await createServiceClient()
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: Role }>();
  if (error) throw new Error("profiles 조회 실패");
  return { userId, role: profile?.role ?? "user" };
}

/** 지정 역할만 허용. 비로그인 401 UNAUTHENTICATED, 역할 불일치 403 FORBIDDEN (API.md 1·3절). */
export async function requireRole(scope: RequestScope, role: Role): Promise<Actor> {
  const actor = await getActor(scope);
  if (!actor) throw new ApiError("UNAUTHENTICATED");
  if (actor.role !== role) throw new ApiError("FORBIDDEN");
  return actor;
}
