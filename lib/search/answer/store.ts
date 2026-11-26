// 검색으로 만든 AI 결과 저장소 (DEC-076, server-only, service_role). 표 generated_results.
// 요청자(계정·세션·IP)를 담지 않는다. 키는 개인정보 꼴이 없는 검색어(storableQuery를 지난 것)이거나 공개 법령 이름이다.
// 저장·읽기가 실패해도 검색·답은 그대로 간다 — 저장은 덧붙이는 기능이라 오류로 막지 않는다(표가 아직 없는 DB 포함).
// 로그에는 키·내용을 남기지 않는다.
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export type GeneratedKind = "search" | "research" | "law_easy";
export type Generated = { payload: unknown; promptVersion: string; updatedAt: string };

export async function readGenerated(kind: GeneratedKind, key: string): Promise<Generated | null> {
  try {
    const { data, error } = await createServiceClient()
      .from("generated_results")
      .select("payload, prompt_version, updated_at")
      .eq("kind", kind)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return {
      payload: data.payload as unknown,
      promptVersion: String(data.prompt_version),
      updatedAt: String(data.updated_at),
    };
  } catch {
    return null;
  }
}

/** 다시 쓴 횟수만 올린다 (실패해도 무시) */
export async function bumpGenerated(kind: GeneratedKind, key: string): Promise<void> {
  try {
    await createServiceClient().rpc("bump_generated_result", { p_kind: kind, p_key: key });
  } catch {
    // 횟수는 운영 참고용이라 실패해도 넘어간다
  }
}

/** 새로 만들었거나 덧붙인 결과를 쓴다. 덧붙이기(merge)는 부르는 쪽이 앞의 결과를 읽어 합친 뒤 넘긴다 */
export async function saveGenerated(
  kind: GeneratedKind,
  key: string,
  payload: unknown,
  promptVersion: string,
): Promise<boolean> {
  try {
    const { error } = await createServiceClient().from("generated_results").upsert(
      {
        kind,
        key,
        payload,
        prompt_version: promptVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "kind,key" },
    );
    return !error;
  } catch {
    return false;
  }
}
