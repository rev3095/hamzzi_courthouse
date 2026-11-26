"use client";
// 분야별 비서 대화 (F-018, DEC-057). 비서 페이지와 햄찌 안내 챗봇의 '비서와 대화' 모드가 함께 쓴다.
// 한 번 보내기 = 질문 1건이다. 일반 질문과 같은 길을 간다:
//   POST /inquiries (scanInput 마스킹·민감정보 동의, 절대 규칙 4) → 둘째 질문부터 parentInquiryId로 이어 묻기
//   → POST /analyze { assistant } (하루 횟수·비용 상한·인용 검증은 서버가 그대로, 절대 규칙 1·7)
// 말풍선에는 검증을 통과한 문단(과 DEC-055의 모델 근거 문단)만 보이고, 문단마다 출처와 AI 고지(AI_NOTICE)을 단다 (절대 규칙 6).
// 이 기기(sessionStorage)에는 질문 번호와 서버가 돌려준 마스킹본만 둔다 — 원문은 입력란에만 있다 (DEC-006).
// usePathname 같은 라우트 훅은 쓰지 않는다 (cacheComponents, 레이아웃의 안내 챗봇에서도 쓰인다).
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ASSISTANTS,
  ASSISTANT_ANSWER_TIER,
  inScope,
  type AssistantId,
} from "@/lib/assistants/agents";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { MAX_INPUT_CHARS } from "@/lib/inquiries/policy";
import {
  analyzeStream,
  getResult,
  isQuotaBlocked,
  isUserDailyLimit,
  notifyQuotaChanged,
  rememberAssistant,
} from "@/lib/client/api";
import { sourceRef } from "@/components/result/labels";
import { AttachButton, AttachTray } from "@/components/ask/AttachTray";
import { SaveToggle } from "@/components/ask/SaveToggle";
import { askErrorText, useAsk } from "@/components/ask/useAsk";
import { useAttachments } from "@/components/ask/useAttachments";
import { useMaterialsAsk } from "@/components/ask/useMaterialsAsk";
import { TIER_TEXT } from "@/components/ask/TierSlider";
import { useQuota } from "@/components/useQuota";
import { AssistantEmblem } from "./AssistantIcon";
import "./assistants.css";

type Turn = {
  id: string;
  question: string;
  status: "analyzing" | "done" | "error";
  step?: string;
  result?: DemoAnalysisResult;
  error?: string;
};

const THREAD_KEY = (a: AssistantId) => `hz:as:${a}`;
/** 이 기기에 남겨 두는 대화 수 (오래된 것부터 뺀다) */
const KEEP_TURNS = 12;

export function loadThread(a: AssistantId): { id: string; question: string }[] {
  try {
    const raw = sessionStorage.getItem(THREAD_KEY(a));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter(
          (t): t is { id: string; question: string } =>
            typeof t?.id === "string" && typeof t?.question === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function saveThread(a: AssistantId, turns: Turn[]) {
  try {
    const keep = turns
      .filter((t) => t.status !== "error")
      .slice(-KEEP_TURNS)
      .map(({ id, question }) => ({ id, question }));
    sessionStorage.setItem(THREAD_KEY(a), JSON.stringify(keep));
  } catch {
    // 저장소를 못 쓰면 새로 고칠 때 대화가 비워질 뿐이다
  }
}

export function AssistantChat({
  assistant: id,
  variant = "page",
  draft,
  onDraft,
  autoSend,
}: {
  assistant: AssistantId;
  /** page = 비서 페이지, compact = 안내 챗봇 창 안 */
  variant?: "page" | "compact";
  /** 옆 도움 판이 질문창에 문장을 넣을 때 (없으면 안에서 관리) */
  draft?: string;
  onDraft?: (v: string) => void;
  /** 아카이브 체험하기: key가 바뀔 때마다 text를 한 번 보낸다 */
  autoSend?: { text: string; key: number } | null;
}) {
  const a = ASSISTANTS[id];
  const [ownDraft, setOwnDraft] = useState("");
  const text = draft ?? ownDraft;
  const setText = onDraft ?? setOwnDraft;
  const [turns, setTurns] = useState<Turn[]>([]);
  const alive = useRef(true);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const quota = useQuota();

  const update = useCallback((turnId: string, patch: Partial<Turn>) => {
    setTurns((ts) => ts.map((t) => (t.id === turnId ? { ...t, ...patch } : t)));
  }, []);

  // 새로 고침 뒤에도 이 탭의 대화를 다시 보여 준다 (저장된 결과를 읽기만 한다 — 다시 분석하지 않는다)
  useEffect(() => {
    alive.current = true;
    const saved = loadThread(id);
    if (saved.length > 0) {
      void Promise.all(
        saved.map(async (t): Promise<Turn | null> => {
          const r = await getResult(t.id);
          return r.ok ? { ...t, status: "done", result: r.data.result } : null;
        }),
      ).then((loaded) => {
        // 그사이 새 질문을 보냈으면 앞에 붙인다
        if (alive.current)
          setTurns((now) => [...loaded.filter((t): t is Turn => t !== null), ...now]);
      });
    }
    return () => {
      alive.current = false;
    };
  }, [id]);

  useEffect(() => {
    if (turns.length > 0) saveThread(id, turns);
    // 대화 칸 안에서만 맨 아래로 (페이지 전체는 움직이지 않는다)
    const el = log.current;
    if (el && turns.length > 0) el.scrollTop = el.scrollHeight;
  }, [turns, id]);

  const busy = turns.some((t) => t.status === "analyzing");
  const lastDone = [...turns].reverse().find((t) => t.status === "done");

  const ask = useAsk({
    parentInquiryId: lastDone?.id,
    onReady: (inquiryId, masked) => {
      setText("");
      void analyze(inquiryId, masked);
    },
  });

  /** 질문이 준비되면(마스킹·동의 뒤) 이 화면에서 바로 분석한다. 비서 이름은 결과 화면에서 다시 분석할 때도 쓰이게 남긴다 */
  async function analyze(inquiryId: string, maskedText: string) {
    rememberAssistant(inquiryId, id);
    setTurns((ts) => [
      ...ts,
      { id: inquiryId, question: maskedText, status: "analyzing", step: "질문을 읽는 중" },
    ]);
    const r = await analyzeStream(inquiryId, (e) => update(inquiryId, { step: e.message }), null, {
      assistant: id,
    });
    if (!alive.current) return;
    notifyQuotaChanged();
    if (r.ok) return update(inquiryId, { status: "done", result: r.data.result });
    if (r.error.code === "INVALID_STATE") {
      const saved = await getResult(inquiryId);
      if (saved.ok) return update(inquiryId, { status: "done", result: saved.data.result });
    }
    if (r.error.code === "LOGIN_REQUIRED" || isUserDailyLimit(r.error)) {
      update(inquiryId, { status: "error", error: "오늘 질문할 수 있는 횟수를 모두 썼어요." });
      ask.showLimit();
      return;
    }
    update(inquiryId, { status: "error", error: askErrorText(r.error) });
  }

  // 아카이브 체험하기: 같은 질문을 보낸다 — 서버가 저장된 답을 재생한다(비용·횟수 0)
  const lastAuto = useRef<number | null>(null);
  useEffect(() => {
    if (!autoSend || lastAuto.current === autoSend.key) return;
    lastAuto.current = autoSend.key;
    void ask.send(autoSend.text);
    // ask는 렌더마다 새 객체라 deps에서 뺀다 — key가 바뀔 때만 보낸다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend]);

  // 사진·문서 붙이기: 자료 첨부(F-017)와 같은 창(동의 → 읽기 → 확인)을 거쳐 같은 길로 질문을 보낸다.
  // 읽기 호출·횟수·금액 상한은 그 경로의 서버 규칙 그대로다. 질문이 준비되면 위 onReady가 비서 분석으로 잇는다
  const attach = useAttachments();
  const attached = attach.items.length > 0;
  const materials = useMaterialsAsk({
    attach,
    send: ask.send,
    busy: ask.busy,
    error: ask.error,
    blocked: isQuotaBlocked(quota),
    showLimit: ask.showLimit,
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || ask.busy) return;
    if (materials.start(text)) return;
    void ask.send(text);
  };

  const pickStarter = (s: string) => {
    setText(s);
    input.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const reset = () => {
    setTurns([]);
    try {
      sessionStorage.removeItem(THREAD_KEY(id));
    } catch {
      // 저장소를 못 쓰면 화면만 비운다
    }
  };

  const compact = variant === "compact";

  return (
    <div className={`flex min-h-0 flex-col ${compact ? "h-full" : ""}`}>
      <div
        ref={log}
        role="log"
        aria-live="polite"
        aria-busy={busy}
        // 페이지에서는 대화가 쌓이는 만큼만 커진다 — 처음부터 큰 빈 칸을 두지 않아 질문창이 바로 보인다
        className={`hza-log flex-1 overflow-y-auto ${
          compact ? "space-y-4 px-3 py-4" : "hza-card max-h-[72dvh] space-y-6 px-5 py-6 sm:px-7"
        }`}
      >
        <BotRow id={id} compact={compact}>
          <div className="hza-bot">
            <p>{a.greeting}</p>
            {/* 비서 페이지는 머리에 같은 안내가 있어 챗봇 창에서만 말풍선에 싣는다 */}
            {compact && a.disclaimer && (
              <p className="hza-muted mt-2 text-[13px]">{a.disclaimer}</p>
            )}
          </div>
        </BotRow>

        {/* 챗봇 창은 아래가 좁아 질문 예를 대화 칸 안에 둔다. 비서 페이지는 질문창 아래에서 고른다 */}
        {compact && turns.length === 0 && (
          <div className="pl-10">
            <Starters list={a.starters} onPick={pickStarter} />
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id} className="space-y-3">
            <p className="hza-me">{t.question}</p>
            <BotRow id={id} compact={compact}>
              {t.status === "analyzing" ? (
                <div className="hza-bot" role="status">
                  <span className="hza-dots mr-2 align-middle" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="hza-muted text-sm">{t.step ?? "찾아보는 중"}</span>
                </div>
              ) : t.status === "error" ? (
                <div className="hza-bot">
                  <p>{t.error}</p>
                </div>
              ) : t.result ? (
                <AnswerBubble assistant={id} inquiryId={t.id} result={t.result} />
              ) : null}
            </BotRow>
          </div>
        ))}
      </div>

      <form
        onSubmit={submit}
        className={compact ? "border-t border-[var(--hza-line)] px-3 pt-2.5 pb-3" : "mt-5"}
      >
        <div className={`flex items-end gap-2.5 ${compact ? "" : "max-sm:flex-wrap"}`}>
          {/* 사진·문서 붙이기 (F-017 자료 첨부와 같은 흐름): 비서 페이지에서만 */}
          {!compact && (
            <div className="hza-attach">
              <AttachButton attach={attach} disabled={busy || ask.busy} noun="자료" />
            </div>
          )}
          <label htmlFor={`hza-input-${id}-${variant}`} className="sr-only">
            {a.name}에게 질문하기
          </label>
          <textarea
            id={`hza-input-${id}-${variant}`}
            ref={input}
            rows={compact ? 2 : 3}
            value={text}
            maxLength={MAX_INPUT_CHARS}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder={
              attached
                ? "붙인 자료에 대해 궁금한 점을 적어 주세요 (비워도 돼요)"
                : lastDone
                  ? "이어서 묻고 싶은 것을 적어 주세요"
                  : "있었던 일을 적어 주세요 (이름·연락처·계좌번호는 빼고)"
            }
            className={`hza-input ${compact ? "" : "max-sm:order-first max-sm:basis-full"}`}
          />
          <button
            type="submit"
            className={`hza-btn shrink-0 ${compact ? "" : "max-sm:flex-1"}`}
            disabled={busy || ask.busy || (!text.trim() && !attached)}
          >
            보내기
          </button>
        </div>
        {!compact && <AttachTray attach={attach} noun="자료" />}
        {/* 기록 저장은 이 기기의 선택을 그대로 따르므로 대화 화면에서도 보이고 바꿀 수 있게 둔다 (DEC-039·067) */}
        {!compact && <SaveToggle />}
        {!compact && attached && (
          <p className="hza-muted mt-2 text-[13px] leading-relaxed">
            보내기를 누르면 동의를 받은 뒤 AI가 붙인 자료를 읽고, 읽은 내용을 확인한 다음 질문해요.
          </p>
        )}
        {ask.error && (
          <p role="alert" className="mt-2 text-sm font-semibold text-[var(--hza-strong)]">
            {ask.error}
          </p>
        )}
        <div className="hza-muted mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] leading-relaxed">
          <span>
            {!compact && quota?.ai !== false && <TierFixed />}
            분석이 끝난 질문마다 1회로 세요(예시 질문 제외)
            {quota &&
              !quota.admin &&
              quota.remaining !== null &&
              ` · 오늘 남은 질문 ${quota.remaining}회`}
          </span>
          {turns.length > 0 && !busy && (
            <button type="button" onClick={reset} className="hza-link min-h-8">
              새 대화
            </button>
          )}
        </div>
        {!compact && turns.length === 0 && (
          <div className="mt-6">
            <Starters list={a.starters} onPick={pickStarter} />
          </div>
        )}
      </form>
      {materials.flow}
      {ask.modals}
    </div>
  );
}

/** 질문 예: 누르면 질문창에 문장을 넣는다 (보내기는 사용자가 누른다) */
function Starters({ list, onPick }: { list: string[]; onPick: (s: string) => void }) {
  return (
    <div role="group" aria-label="질문 예">
      <p className="hza-eyebrow mb-2.5">이렇게 물어볼 수 있어요</p>
      <div className="flex flex-col items-stretch gap-2.5">
        {list.map((s) => (
          <button key={s} type="button" className="hza-chip" onClick={() => onPick(s)}>
            {s.trim()}
          </button>
        ))}
      </div>
    </div>
  );
}

function BotRow({
  id,
  compact,
  children,
}: {
  id: AssistantId;
  compact: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <AssistantEmblem id={id} size={compact ? 30 : 36} />
      {children}
    </div>
  );
}

function AnswerBubble({
  assistant,
  inquiryId,
  result,
}: {
  assistant: AssistantId;
  inquiryId: string;
  result: DemoAnalysisResult;
}) {
  const points = result.answer.points;
  const outside = !inScope(assistant, result.section);
  return (
    <div className="hza-bot">
      {result.mode === "replay" && (
        <p className="hza-muted mb-3 text-[13px]">
          미리 만들어 둔 예시 답변이에요. 질문 횟수에 들어가지 않아요.
        </p>
      )}
      {result.assistantTalk && (
        <div className="mb-3 border-b border-[var(--hza-line)] pb-3">
          {/* 대화 한마디는 근거가 없는 말이라 아래 근거 답변과 구분해 표시한다 */}
          <p className="hza-muted mb-1 text-[12px] font-semibold">대화 정리 · 근거 아님</p>
          <p>{result.assistantTalk.reply}</p>
          {result.assistantTalk.asks.length > 0 && (
            <>
              <p className="hza-muted mt-2 text-[13px] font-semibold">
                이런 점을 알려 주시면 더 맞는 근거를 찾아볼게요
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px]">
                {result.assistantTalk.asks.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {outside && (
        <p className="hza-muted mb-3 text-[13px]">
          이 질문은 {ASSISTANTS[assistant].name}이 주로 다루는 분야 밖으로 보여요. 홈의 일반
          질문으로 물어보면 그 분야에 맞춰 정리해요.{" "}
          <Link href="/" className="hza-link">
            일반 질문하기
          </Link>
        </p>
      )}
      {points.length > 0 ? (
        <ol>
          {points.map((p, i) => {
            // 법제처 근거 없이 모델이 쓴 문단(DEC-055)은 결과 화면처럼 출처 상자 없이 문단만 보인다
            if (p.check === "model")
              return (
                <li key={i} className="hza-point">
                  <p>{p.text}</p>
                </li>
              );
            const ref = sourceRef(p.source, result);
            return (
              <li key={i} className="hza-point">
                <p>{p.text}</p>
                <p className="hza-source">
                  <span>출처 · {ref.label}</span>
                  <span className="hza-badge">
                    {p.check === "verified" ? "검증됨" : "확인 필요"}
                  </span>
                  {ref.url && (
                    <a href={ref.url} target="_blank" rel="noreferrer" className="hza-link">
                      원문
                    </a>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      ) : (
        <SearchOnly result={result} />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="hza-notice">{result.aiNotice}</span>
        <Link href={`/inquiries/${inquiryId}`} className="hza-link text-[13px]">
          근거·절차 자세히 보기
        </Link>
      </div>
    </div>
  );
}

function SearchOnly({ result }: { result: DemoAnalysisResult }) {
  const articles = result.articles.slice(0, 3);
  const cases = result.cases.slice(0, 2);
  if (articles.length === 0 && cases.length === 0)
    return <p>이번에는 법제처에서 맞는 법령·판례를 찾지 못했어요. 조금 다르게 적어 볼까요?</p>;
  return (
    <>
      <p>
        {result.mode === "search_only"
          ? "지금은 AI 답변 없이 법제처에서 찾은 법령·판례만 보여 드려요."
          : "이번 질문은 근거를 확인한 AI 답변을 만들지 못해 찾은 법령·판례만 보여 드려요."}
      </p>
      <ul className="mt-2 space-y-1 text-[14px]">
        {articles.map((x) => (
          <li key={x.id}>
            <a href={x.sourceUrl} target="_blank" rel="noreferrer" className="hza-link">
              {x.lawName} {x.articleNo}
              {x.title ? ` (${x.title})` : ""}
            </a>
          </li>
        ))}
        {cases.map((c) => (
          <li key={c.id}>
            <Link href={`/cases/${c.id}`} className="hza-link">
              {c.court} {c.caseNo}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** 비서 답변 모드는 고정이다 (DEC-057 ⑧): 근거 답변 Pro Max, 대화 한마디는 가벼운 모델. 화면에는 모델 이름을 싣지 않는다 */
function TierFixed() {
  return (
    <>
      <span className="font-semibold">답변 모드 {TIER_TEXT[ASSISTANT_ANSWER_TIER].name} 고정</span>
      {" · "}
    </>
  );
}
