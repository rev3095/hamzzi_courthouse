// 분야별 비서 묶음 (F-018, DEC-057): 홈 '가이드' 아래와 /assistants 목록이 함께 쓴다.
// 카드마다 그 비서의 색으로 칠한다(data-hza). 문안은 lib/assistants/agents의 고정 문안뿐이다.
import Link from "next/link";
import { ASSISTANT_LIST, SERVICE_NAMES_NOTICE } from "@/lib/assistants/agents";
import { AssistantEmblem } from "./AssistantIcon";
import "./assistants.css";

export function AssistantCards({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <ul
        className={`grid gap-4 ${
          compact
            ? "max-sm:-mx-4 max-sm:flex max-sm:snap-x max-sm:overflow-x-auto max-sm:px-4 max-sm:pb-2 sm:grid-cols-3"
            : "md:grid-cols-3"
        }`}
      >
        {ASSISTANT_LIST.map((a) => (
          <li
            key={a.id}
            data-hza={a.id}
            className="hza-root hza-card max-sm:min-w-[78%] max-sm:snap-start"
          >
            <Link href={a.href} className="flex h-full flex-col gap-3.5 p-6 text-left">
              <AssistantEmblem id={a.id} size={compact ? 44 : 52} />
              <span className="hza-title font-display text-[22px] leading-tight font-bold">
                {a.name}
              </span>
              <span className="hza-muted text-[14px] leading-[1.7]">{a.tagline}</span>
              <span className="hza-accent-text mt-auto pt-2 text-[14px] font-bold">
                대화 시작 →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-muted mt-3 text-[12px]">{SERVICE_NAMES_NOTICE}</p>
    </>
  );
}
