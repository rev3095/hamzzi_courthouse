"use client";
// 햄찌 안내 챗봇 (DEC-030): 화면 어디서나 오른쪽 아래 햄찌 버튼 → 메뉴로 고르는 대화 창.
// 고정 문안(lib/guide/topics.ts)만 보여 준다 — Claude 호출 없음, 입력 칸 없음, 대화는 이 화면 메모리에만 있고 저장·로그하지 않는다.
// Figma에 없는 화면이라 브랜드 토큰(honey·ink·line, 모서리 panel·card·button)과 Modal 모양을 따른다.
// usePathname 같은 라우트 훅을 쓰지 않아 레이아웃에 바로 둘 수 있다 (cacheComponents).
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HamzziBadge, HamzziJudge } from "@/components/HamzziJudge";
import {
  GREETING,
  GUIDE_NOTICE,
  guideEmail,
  guideTopic,
  MENU_IDS,
  type GuideTopic,
} from "@/lib/guide/topics";

/** 대화 기록: 고른 주제 id, 또는 "처음 메뉴로" */
type Entry = { key: number; id: string };
const MENU = "__menu";

const chip =
  "rounded-full border-honey-line bg-white text-ink hover:border-gold min-h-11 border px-3.5 py-2 text-left text-sm leading-snug";

export function GuideBot() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [emailShown, setEmailShown] = useState(false);
  const nextKey = useRef(0);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  /** 닫은 뒤 햄찌 버튼으로 포커스를 돌려줄지 (링크로 이동할 때는 돌려주지 않는다) */
  const refocus = useRef(false);

  const close = useCallback(() => {
    refocus.current = true;
    setOpen(false);
  }, []);
  const closeForLink = useCallback(() => setOpen(false), []);

  const choose = useCallback((id: string) => {
    setEntries((es) => [...es, { key: nextKey.current++, id }]);
  }, []);

  useEffect(() => {
    if (!open) {
      if (refocus.current) launcher.current?.focus();
      refocus.current = false;
      return;
    }
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // 새로 고른 항목의 시작(내가 고른 말풍선)이 창 위쪽에 오게 — 긴 답변도 처음부터 읽힌다
  const latest = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = latest.current ? latest.current.offsetTop - 12 : 0;
  }, [entries, open]);

  const last = entries.at(-1);

  return (
    <>
      {!open && (
        <button
          ref={launcher}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="햄찌 안내 열기 (AI 캐릭터)"
          className="border-honey-line bg-honey text-ink hover:border-gold fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex min-h-14 items-center gap-2 rounded-full border p-1 shadow-[0_18px_50px_-28px_rgba(26,34,51,.5)] sm:right-6 sm:bottom-6 sm:pr-4"
        >
          <HamzziBadge size={48} />
          <span className="text-sm font-bold max-sm:sr-only">햄찌 안내</span>
        </button>
      )}

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby="hz-guide-title"
          tabIndex={-1}
          className="border-line fixed inset-x-0 bottom-0 z-40 flex h-[85dvh] flex-col border bg-white shadow-[0_18px_50px_-20px_rgba(26,34,51,.55)] outline-none max-sm:rounded-t-[16px] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[min(600px,calc(100dvh-7rem))] sm:w-[380px] sm:rounded-[16px]"
        >
          <div className="border-line flex items-center gap-3 border-b px-4 py-3">
            <HamzziBadge size={40} />
            <div className="min-w-0 flex-1">
              <h2
                id="hz-guide-title"
                className="font-display text-ink text-lg leading-tight font-bold"
              >
                햄찌 안내
              </h2>
              <p className="text-muted text-[13px] leading-snug">
                AI 캐릭터
                <br />
                {GUIDE_NOTICE}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="햄찌 안내 닫기"
              className="rounded-button text-muted hover:text-ink flex size-11 shrink-0 items-center justify-center"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div
            ref={log}
            role="log"
            aria-live="polite"
            className="bg-bg relative flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <div className="flex items-end gap-3">
              <HamzziJudge size={56} mood="curious" interactive={false} />
              <HamzziSays>
                <p>{GREETING}</p>
              </HamzziSays>
            </div>
            {entries.length === 0 && <Chips ids={MENU_IDS} onChoose={choose} />}

            {entries.map((e) => {
              const isLast = e === last;
              if (e.id === MENU) {
                return (
                  <div key={e.key} ref={isLast ? latest : undefined} className="space-y-3">
                    <Avatar>
                      <HamzziSays>
                        <p>다른 것도 골라 보세요!</p>
                      </HamzziSays>
                    </Avatar>
                    {isLast && <Chips ids={MENU_IDS} onChoose={choose} />}
                  </div>
                );
              }
              const t = guideTopic(e.id);
              if (!t) return null;
              return (
                <div key={e.key} ref={isLast ? latest : undefined} className="space-y-3">
                  <p className="bg-ink rounded-card ml-auto w-fit max-w-[85%] rounded-br-[4px] px-3.5 py-2 text-sm text-white">
                    {t.label}
                  </p>
                  <Avatar>
                    <TopicAnswer
                      topic={t}
                      emailShown={emailShown}
                      onShowEmail={() => setEmailShown(true)}
                      onLink={closeForLink}
                    />
                  </Avatar>
                  {isLast && (
                    <div className="flex flex-wrap gap-2">
                      {t.next?.map((id) => (
                        <ChipButton key={id} id={id} onChoose={choose} />
                      ))}
                      <button
                        type="button"
                        onClick={() => choose(MENU)}
                        className="text-muted hover:text-ink min-h-11 rounded-full px-3 text-sm underline underline-offset-2"
                      >
                        처음 메뉴로
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function Avatar({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <HamzziBadge size={32} />
      {children}
    </div>
  );
}

function HamzziSays({ children }: { children: ReactNode }) {
  return (
    <div className="border-line text-ink rounded-card min-w-0 flex-1 space-y-2 rounded-tl-[4px] border bg-white px-3.5 py-3 text-[15px] leading-relaxed">
      {children}
    </div>
  );
}

function TopicAnswer({
  topic,
  emailShown,
  onShowEmail,
  onLink,
}: {
  topic: GuideTopic;
  emailShown: boolean;
  onShowEmail: () => void;
  onLink: () => void;
}) {
  return (
    <HamzziSays>
      {topic.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {topic.list && (
        <ol className="list-decimal space-y-1 pl-5">
          {topic.list.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      )}
      {topic.contact &&
        (emailShown ? (
          <p>
            <a
              href={`mailto:${guideEmail()}`}
              className="text-link font-semibold break-all underline underline-offset-2"
            >
              {guideEmail()}
            </a>
          </p>
        ) : (
          <button
            type="button"
            onClick={onShowEmail}
            className="rounded-button bg-ink min-h-11 px-4 text-sm font-semibold text-white"
          >
            이메일 보기
          </button>
        ))}
      {topic.links && (
        <ul className="border-line space-y-1 border-t pt-2 text-sm">
          {topic.links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={onLink}
                className="text-link inline-flex min-h-8 items-center underline underline-offset-2"
              >
                {l.label} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HamzziSays>
  );
}

function Chips({ ids, onChoose }: { ids: readonly string[]; onChoose: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <ChipButton key={id} id={id} onChoose={onChoose} />
      ))}
    </div>
  );
}

function ChipButton({ id, onChoose }: { id: string; onChoose: (id: string) => void }) {
  const t = guideTopic(id);
  if (!t) return null;
  return (
    <button type="button" onClick={() => onChoose(id)} className={chip}>
      {t.label}
    </button>
  );
}
