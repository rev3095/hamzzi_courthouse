// 홈에 올린 사건 서류(DEC-070 ③)로 사건 진행의 새 사건을 만든다 — 서류 판독(F-015) 결과를 사건 자료 모양으로 옮기는 순수 함수.
// 판독 결과에는 개인 이름이 없다(역할로만, DEC-052). 모델을 부르지 않는다. 판정 항목을 만들지 않는다 (절대 규칙 2).
import type { CaseReading } from "@/lib/casefile/limits";
import { MATTER_LIMITS, emptyMatter, newId, type MatterData } from "./model";

const cut = (s: string, n: number) => s.trim().slice(0, n);

export function matterFromReading(reading: CaseReading, pages: number): MatterData {
  const docId = newId();
  const now = new Date().toISOString();
  const kind = reading.docTypes[0] ?? "서류";
  return {
    ...emptyMatter(),
    // 사건 요약 칸은 사용자가 직접 쓰는 칸이라 비워 두고, AI가 읽은 개요는 서류의 요지(AI 고지가 붙는 자료 탭)에만 둔다
    docs: [
      {
        id: docId,
        title: cut(reading.docTypes.join(", ") || "올린 서류", MATTER_LIMITS.short),
        type: cut(kind, MATTER_LIMITS.short),
        date: "",
        gist: cut(reading.summary, MATTER_LIMITS.line),
        pages: Math.max(0, Math.min(50, pages)),
        addedAt: now,
      },
    ],
    demands: reading.claims
      .slice(0, MATTER_LIMITS.demands)
      .map((c) => ({ id: newId(), what: cut(c, MATTER_LIMITS.line), due: "", docId })),
    parties: reading.parties.slice(0, MATTER_LIMITS.parties).map((p) => ({
      id: newId(),
      // 개인은 이름이 없어 서류의 역할로 부른다
      name: cut(p.name || p.role, MATTER_LIMITS.short),
      kind: p.kind,
      side: p.side,
      role: cut(p.role, MATTER_LIMITS.short),
      note: "",
    })),
  };
}
