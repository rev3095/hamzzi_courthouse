// AI 절차 분류 라벨 저장소 (DEC-033, server-only, service_role). 질문 문장은 저장하지 않는다.
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import {
  isKnownTrack,
  type LabelStatus,
  type LabelStep,
  type NewLabel,
  type ProcedureLabel,
} from "./labels";

type Row = {
  id: string;
  title: string;
  keywords: string[];
  track: string | null;
  steps: LabelStep[] | null;
  status: LabelStatus;
  hits: number;
  created_at: string;
};

const COLUMNS = "id, title, keywords, track, steps, status, hits, created_at";

const toLabel = (r: Row): ProcedureLabel => ({
  id: r.id,
  title: r.title,
  keywords: r.keywords,
  track: isKnownTrack(r.track) ? r.track : null,
  steps: r.steps,
  status: r.status,
  hits: r.hits,
  createdAt: r.created_at,
});

// 질문마다 표를 다시 읽지 않게 잠깐 기억한다. 승인·거절·새 라벨은 이 서버 인스턴스에서 바로 비운다
const CACHE_MS = 60_000;
let cache: { at: number; labels: ProcedureLabel[] } | null = null;

export function clearLabelCache() {
  cache = null;
}

/** 분류에 쓸 라벨(거절 제외). 표가 아직 없거나 읽지 못하면 빈 목록 — 분석을 막지 않는다 */
export async function activeLabels(): Promise<ProcedureLabel[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.labels;
  const { data, error } = await createServiceClient()
    .from("procedure_labels")
    .select(COLUMNS)
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return [];
  const labels = (data as Row[]).map(toLabel);
  cache = { at: Date.now(), labels };
  return labels;
}

export async function insertLabel(label: NewLabel): Promise<ProcedureLabel | null> {
  const { data, error } = await createServiceClient()
    .from("procedure_labels")
    .insert({
      title: label.title,
      keywords: label.keywords,
      track: label.track,
      steps: label.steps,
      status: label.status,
      hits: 1,
    })
    .select(COLUMNS)
    .single();
  if (error) return null;
  clearLabelCache();
  return toLabel(data as Row);
}

/** 사용 횟수 올리기. 실패해도 분석에는 영향이 없다 */
export async function bumpLabel(id: string): Promise<void> {
  await createServiceClient().rpc("bump_procedure_label", { p_id: id });
}

export async function listLabels(): Promise<ProcedureLabel[]> {
  const { data, error } = await createServiceClient()
    .from("procedure_labels")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("procedure_labels 조회 실패");
  return (data as Row[]).map(toLabel);
}

export async function reviewLabel(id: string, status: LabelStatus): Promise<ProcedureLabel | null> {
  const { data, error } = await createServiceClient()
    .from("procedure_labels")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error("procedure_labels 수정 실패");
  clearLabelCache();
  return data ? toLabel(data as Row) : null;
}
