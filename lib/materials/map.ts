// 자료 첨부 (F-017, DEC-058) — 결과 화면용 자료 지도. 브라우저 묶음에도 들어가므로 zod와 limits만 끌어온다.
// 자료 카드와 "이 자료를 참고한 답변 문단" 연결만 담는다. 증거로서의 힘·유불리는 담지 않는다 (절대 규칙 2).
import { z } from "zod";
import { MATERIAL_KINDS, MATERIAL_LIMITS, type MaterialReading } from "./limits";

const Str = z.string();

/** 저장된 자료를 읽을 때 형식 확인 (모양이 다르면 없는 것으로 본다) */
export const StoredMaterialsZ = z.array(
  z.object({
    kind: z.enum(MATERIAL_KINDS),
    summary: Str,
    details: z.array(Str),
    gaps: z.array(Str),
  }),
);
export function readStoredMaterials(v: unknown): MaterialReading[] {
  const r = StoredMaterialsZ.safeParse(v);
  return r.success ? r.data.slice(0, MATERIAL_LIMITS.maxItems) : [];
}

/** 문단별 자료 번호 (모델 답변에서 읽은 것) */
export type MaterialRef = { text: string; materials: number[] };

/** API.md DemoAnalysisResult.materials — 자료마다 그 자료를 참고한 (검증을 통과한) 답변 문단 순번 */
export type MaterialsMap = {
  items: (MaterialReading & { points: number[] })[];
};

/**
 * 저장된 자료 + 문단별 자료 번호 + 검증을 통과해 남은 문단 → 화면용 자료 지도.
 * 문단은 글자가 같은 것으로 다시 찾는다 — 검증에서 빠진 문단은 연결에서도 빠진다.
 */
export function buildMaterialsMap(
  list: MaterialReading[],
  refs: MaterialRef[],
  finalPoints: { text: string }[],
): MaterialsMap | undefined {
  if (list.length === 0) return undefined;
  const refOf = new Map(refs.map((r) => [r.text, r.materials]));
  const items = list.map((m) => ({ ...m, points: [] as number[] }));
  finalPoints.forEach((p, index) => {
    for (const n of refOf.get(p.text.trim()) ?? []) items[n - 1]?.points.push(index);
  });
  return { items };
}

/** 저장된 결과를 다시 읽을 때 형식 확인 (모양이 다르면 그리지 않는다) */
export function parseMaterialsMap(v: unknown): MaterialsMap | null {
  const r = z
    .object({
      items: z.array(
        z.object({
          kind: z.enum(MATERIAL_KINDS),
          summary: Str,
          details: z.array(Str),
          gaps: z.array(Str),
          points: z.array(z.number().int().min(0)),
        }),
      ),
    })
    .safeParse(v);
  return r.success && r.data.items.length > 0 ? r.data : null;
}
