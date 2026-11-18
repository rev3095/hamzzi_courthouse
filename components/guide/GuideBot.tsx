"use client";
// 햄찌 안내 챗봇 (DEC-030): 오른쪽 아래 원형 햄찌 버튼 → 누르면 그 위로 채팅 창이 열린다(모바일은 전체 화면 시트).
// 채팅 창 구조: 머리(햄찌·AI 캐릭터·닫기) → 대화(햄찌 말풍선 왼쪽, 내가 고른 말풍선 오른쪽, 답하는 중 점 3개)
// → 아래 입력 자리(빠른 질문 버튼 + 고지). 자유 입력은 받지 않는다 — 개인정보를 받지 않고 Claude를 부르지 않는다.
// 문안은 lib/guide/topics.ts 고정 문안뿐이고 대화는 이 화면 메모리에만 있다(저장·로그 없음).
// Figma에 없는 화면이라 브랜드 토큰(honey·ink·line)과 모서리 규칙을 따른다.
// usePathname 같은 라우트 훅을 쓰지 않아 레이아웃에 바로 둘 수 있다 (cacheComponents).
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HamzziFace, HamzziJudge } from "@/components/HamzziJudge";
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
/** 햄찌가 답하는 중 표시 시간. 동작 줄이기 설정이면 바로 답한다 */
export const TYPING_MS = 450;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function GuideBot() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [typing, setTyping] = useState(false);
  const [emailShown, setEmailShown] = useState(false);
  const nextKey = useRef(0);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const latest = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 닫은 뒤 햄찌 버튼으로 포커스를 돌려줄지 (링크로 이동할 때는 돌려주지 않는다) */
  const refocus = useRef(false);

  const close = useCallback(() => {
    refocus.current = true;
    setOpen(false);
  }, []);
  const closeForLink = useCallback(() => setOpen(false), []);

  const choose = useCallback((id: string) => {
    if (timer.current) clearTimeout(timer.current);
    setEntries((es) => [...es, { key: nextKey.current++, id }]);
    if (reducedMotion()) return;
    setTyping(true);
    timer.current = setTimeout(() => setTyping(false), TYPING_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

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
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = latest.current ? latest.current.offsetTop - 12 : 0;
  }, [entries, open, typing]);

  const last = entries.at(-1);
  const lastTopic = last && last.id !== MENU ? guideTopic(last.id) : undefined;
  /** 아래 빠른 질문: 처음·"처음 메뉴로" 뒤에는 메뉴 7개, 답한 뒤에는 그 답의 하위 질문 */
  const suggestions: readonly string[] = lastTopic ? (lastTopic.next ?? []) : MENU_IDS;

  return (
    <>
      <button
        ref={launcher}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={open ? "햄찌 안내 창 닫기" : "햄찌 안내 열기 (AI 캐릭터)"}
        title="햄찌에게 물어보기"
        className={`fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex size-16 items-center justify-center rounded-full border-2 shadow-[0_14px_36px_-12px_rgba(26,34,51,.55)] transition-transform hover:scale-105 sm:right-6 sm:bottom-6 ${
          open ? "border-ink bg-ink text-white max-sm:hidden" : "border-honey-line bg-honey"
        }`}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <span className="overflow-hidden rounded-full">
            <HamzziFace size={56} />
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby="hz-guide-title"
          tabIndex={-1}
          className="border-line fixed inset-0 z-40 flex flex-col overflow-hidden bg-white outline-none sm:inset-auto sm:right-6 sm:bottom-[6.5rem] sm:h-[min(620px,calc(100dvh-9rem))] sm:w-[380px] sm:rounded-[20px] sm:border sm:shadow-[0_24px_60px_-24px_rgba(26,34,51,.6)]"
        >
          {/* 머리 */}
          <div className="bg-ink flex items-center gap-3 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white sm:pt-3">
            <span className="bg-honey border-honey-line flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border">
              <HamzziFace size={36} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="hz-guide-title" className="font-display text-lg leading-tight font-bold">
                햄찌 안내
              </h2>
              <p className="text-[13px] text-white/80">AI 캐릭터 · 메뉴를 고르면 답해요</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="햄찌 안내 닫기"
              className="rounded-button flex size-11 shrink-0 items-center justify-center text-white/80 hover:text-white"
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

          {/* 대화 */}
          <div
            ref={log}
            role="log"
            aria-live="polite"
            aria-busy={typing}
            className="bg-bg relative flex-1 space-y-4 overflow-y-auto px-4 py-4"
          >
            <div className="flex flex-col items-center gap-1 pb-1 text-center">
              <HamzziJudge size={64} mood="curious" interactive={false} />
              <p className="text-muted text-[13px]">
                햄찌는 AI 캐릭터예요 · 실제 판사·변호사가 아니에요
              </p>
            </div>
            <BotRow>
              <Bubble>
                <p>{GREETING}</p>
              </Bubble>
            </BotRow>

            {entries.map((e) => {
              const isLast = e === last;
              const t = e.id === MENU ? undefined : guideTopic(e.id);
              if (e.id !== MENU && !t) return null;
              const pending = isLast && typing;
              return (
                <div key={e.key} ref={isLast ? latest : undefined} className="space-y-3">
                  <p className="bg-ink ml-auto w-fit max-w-[80%] rounded-[16px] rounded-br-[4px] px-3.5 py-2 text-[15px] text-white">
                    {t ? t.label : "처음 메뉴로"}
                  </p>
                  <BotRow>
                    {pending ? (
                      <TypingDots />
                    ) : t ? (
                      <TopicAnswer
                        topic={t}
                        emailShown={emailShown}
                        onShowEmail={() => setEmailShown(true)}
                        onLink={closeForLink}
                      />
                    ) : (
                      <Bubble>
                        <p>다른 것도 골라 보세요!</p>
                      </Bubble>
                    )}
                  </BotRow>
                </div>
              );
            })}
          </div>

          {/* 입력 자리: 빠른 질문 버튼 (자유 입력 없음) */}
          <div className="border-line border-t bg-white px-3 pt-2.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            <div
              role="group"
              aria-label="빠른 질문"
              className="flex max-h-[132px] flex-wrap gap-2 overflow-y-auto"
            >
              {suggestions.map((id) => {
                const t = guideTopic(id);
                return t ? (
                  <button
                    key={id}
                    type="button"
                    disabled={typing}
                    onClick={() => choose(id)}
                    className="border-honey-line text-ink hover:border-gold hover:bg-honey min-h-11 rounded-full border bg-white px-3.5 py-2 text-left text-sm leading-snug disabled:opacity-50"
                  >
                    {t.label}
                  </button>
                ) : null;
              })}
              {lastTopic && (
                <button
                  type="button"
                  disabled={typing}
                  onClick={() => choose(MENU)}
                  className="text-muted hover:text-ink min-h-11 rounded-full px-3 text-sm underline underline-offset-2 disabled:opacity-50"
                >
                  처음 메뉴로
                </button>
              )}
            </div>
            <p className="text-muted mt-1.5 text-center text-[12px]">{GUIDE_NOTICE}</p>
          </div>
        </div>
      )}
    </>
  );
}

function BotRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="bg-honey border-honey-line flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border">
        <HamzziFace size={28} />
      </span>
      {children}
    </div>
  );
}

function Bubble({ children }: { children: ReactNode }) {
  return (
    <div className="border-line text-ink max-w-[85%] min-w-0 space-y-2 rounded-[16px] rounded-tl-[4px] border bg-white px-3.5 py-3 text-[15px] leading-relaxed">
      {children}
    </div>
  );
}

function TypingDots() {
  return (
    <div
      role="status"
      aria-label="햄찌가 답하는 중"
      className="border-line flex items-center gap-1 rounded-[16px] rounded-tl-[4px] border bg-white px-4 py-3.5"
    >
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="bg-gold size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
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
    <Bubble>
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
    </Bubble>
  );
}
