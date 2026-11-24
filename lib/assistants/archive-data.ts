// 전문 에이전트 아카이브 데이터 읽기 (F-018, DEC-057). 저장소의 JSON(lib/assistants/archive-data/*.json)이 원본이다.
// 만들기: tests/live/assistant-archive.live.test.ts(유료, 사용자 허락 뒤). 서버에서만 import한다 — 브라우저는 GET /api/v1/assistants/{id}/archive로 받는다.
// lib/demo/policy(findExample)가 이 모듈을 부르므로 그 모듈도 브라우저(components·mobile)에서 import하지 않는다 — JSON 수백 KB가 묶음에 들어간다.
import { AI_NOTICE } from "@/lib/api/respond";
import type { AssistantId } from "./agents";
import { rescreenItem, type ArchiveItem } from "./archive";
import { ARCHIVE_SCENARIOS } from "./archive-scenarios";
import home from "./archive-data/home.json";
import market from "./archive-data/market.json";
import report from "./archive-data/report.json";

// AI 고지는 만든 때의 문구가 아니라 지금 상수(AI_NOTICE)로 보인다 (절대 규칙 6)
// 정리 문장은 지금 규칙(guideLineOk)으로 다시 거른다
const withNotice = (items: ArchiveItem[]) =>
  items.map((i) => rescreenItem({ ...i, result: { ...i.result, aiNotice: AI_NOTICE } }));

const DATA: Record<AssistantId, ArchiveItem[]> = {
  home: withNotice((home as { items: ArchiveItem[] }).items),
  report: withNotice((report as { items: ArchiveItem[] }).items),
  market: withNotice((market as { items: ArchiveItem[] }).items),
};

const order = new Map(ARCHIVE_SCENARIOS.map((s, i) => [s.id, i]));

/** 그 에이전트의 아카이브 (시나리오 순서) */
export function archiveOf(id: AssistantId): ArchiveItem[] {
  return [...DATA[id]].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
}

const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
const byQuestion = new Map(
  Object.values(DATA)
    .flat()
    .map((i) => [normalize(i.question), i]),
);

/** 질문이 아카이브 질문과 같으면(공백·전각 차이 무시) 그 세트 — 체험하기는 저장된 분석을 재생한다(비용 0, DEC-027과 같은 취급) */
export function findArchiveItem(maskedText: string): ArchiveItem | null {
  return byQuestion.get(normalize(maskedText)) ?? null;
}
