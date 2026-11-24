// 비서 표시 아이콘 (DEC-057). 선 아이콘만 쓴다 (브랜드 가이드 3.5). 햄찌 캐릭터는 바꾸지 않는다 (2.4).
import type { AssistantId } from "@/lib/assistants/agents";

const PATHS: Record<AssistantId, string[]> = {
  // 집
  home: ["M4 11.5 12 5l8 6.5", "M6.5 10v8.5h11V10", "M10 18.5v-4.5h4v4.5"],
  // 방패와 확인 표시
  report: ["M12 4 5 6.5v5c0 4.2 3 7.4 7 8.5 4-1.1 7-4.3 7-8.5v-5L12 4Z", "m9 12 2.2 2.2L15.5 10"],
  // 상자와 화살표
  market: ["M4 8.5 12 5l8 3.5v8L12 20l-8-3.5v-8Z", "M4 8.5 12 12l8-3.5", "M12 12v8"],
};

export function AssistantIcon({ id, size = 22 }: { id: AssistantId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {PATHS[id].map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function AssistantEmblem({ id, size = 48 }: { id: AssistantId; size?: number }) {
  return (
    <span className="hza-emblem shrink-0" style={{ width: size, height: size }}>
      <AssistantIcon id={id} size={Math.round(size * 0.52)} />
    </span>
  );
}
