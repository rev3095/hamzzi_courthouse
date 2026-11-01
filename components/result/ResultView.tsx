"use client";
// 결과 화면 /inquiries/[id] (S-03 분석 진행, S-04 결과, S-05 이어 묻기, S-07 결과 없음·오류·하루 상한).
// 저장된 결과가 있으면 보여 주고(GET /result), 없으면 분석을 시작한다(POST /analyze, SSE).
// 실패는 질문 횟수에 세지 않는다 (차감은 분석·검증 성공 후, DEC-010).
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { StepEvent } from "@/lib/ai/policy";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import {
  analyzeStream,
  confirmPii,
  getResult,
  notifyQuotaChanged,
  recallQuestion,
  type ClientError,
} from "@/lib/client/api";
import { HamzziJudge } from "../HamzziJudge";
import { DEMO_LIMIT_TEXT } from "../LimitNotice";
import { PrimaryButton, SecondaryButton } from "../Modal";
import { QuestionBox } from "../ask/QuestionBox";
import { useAsk } from "../ask/useAsk";
import { useQuota } from "../useQuota";
import { ResultPanel } from "./ResultPanel";
import { AiNotice, QuestionQuote, SourceCredit } from "./parts";

type View =
  | { kind: "loading" }
  | { kind: "analyzing"; steps: StepEvent[] }
  | { kind: "done"; result: DemoAnalysisResult }
  | { kind: "error"; error: ClientError };

const noSubscribe = () => () => {};

/** /inquiries/[id] — 주소의 id마다 화면 상태를 새로 시작한다 */
export function ResultRoute() {
  const { id } = useParams<{ id: string }>();
  return <ResultView key={id} id={id} />;
}

export function ResultView({ id }: { id: string }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  // 질문 마스킹본은 이 기기(sessionStorage)에만 있다. 서버 렌더링에서는 비어 있다
  const question = {
    text: useSyncExternalStore(
      noSubscribe,
      () => recallQuestion(id).text,
      () => null,
    ),
    parentId: useSyncExternalStore(
      noSubscribe,
      () => recallQuestion(id).parentId,
      () => null,
    ),
  };
  const alive = useRef(true);
  // 개발 모드(StrictMode)에서 effect가 두 번 돌아도 분석은 한 번만 시작한다
  const started = useRef(false);

  const analyze = useCallback(async () => {
    setView({ kind: "analyzing", steps: [] });
    const r = await analyzeStream(id, (e) => {
      if (!alive.current) return;
      setView((v) => (v.kind === "analyzing" ? { ...v, steps: [...v.steps, e] } : v));
    });
    if (!alive.current) return;
    if (r.ok) {
      notifyQuotaChanged();
      setView({ kind: "done", result: r.data.result });
      return;
    }
    // 다른 창에서 먼저 끝났으면 저장된 결과를 읽는다
    if (r.error.code === "INVALID_STATE") {
      const saved = await getResult(id);
      if (saved.ok) return setView({ kind: "done", result: saved.data.result });
    }
    setView({ kind: "error", error: r.error });
  }, [id]);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      const saved = await getResult(id);
      if (!alive.current) return;
      if (saved.ok) return setView({ kind: "done", result: saved.data.result });
      if (saved.error.code !== "NOT_FOUND") return setView({ kind: "error", error: saved.error });
      if (started.current) return;
      started.current = true;
      await analyze();
    })();
    return () => {
      alive.current = false;
    };
  }, [id, analyze]);

  const retry = () => void analyze();

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 lg:py-12">
      {question.parentId && (
        <p className="text-muted mb-4 text-sm">
          이어 묻기 ·{" "}
          <Link href={`/inquiries/${question.parentId}`} className="text-link underline">
            앞 질문 결과 다시 보기 →
          </Link>
        </p>
      )}
      {view.kind === "loading" && <Analyzing question={question.text} steps={[]} />}
      {view.kind === "analyzing" && <Analyzing question={question.text} steps={view.steps} />}
      {view.kind === "done" &&
        (view.result.outcome === "no_result_in_scope" ? (
          <NoResult result={view.result} question={question.text} />
        ) : (
          <ResultPanel
            result={view.result}
            question={question.text}
            followUp={<FollowUp parentId={id} />}
          />
        ))}
      {view.kind === "error" && (
        <Problem
          error={view.error}
          question={question.text}
          onRetry={retry}
          onConfirmPii={async () => {
            const r = await confirmPii(id);
            if (r.ok) retry();
            else setView({ kind: "error", error: r.error });
          }}
        />
      )}
    </div>
  );
}

function Analyzing({ question, steps }: { question: string | null; steps: StepEvent[] }) {
  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-8 lg:py-8"
    >
      <QuestionQuote text={question} />
      <div className="mt-6 flex flex-col items-center text-center">
        <HamzziJudge size={160} interactive={false} knocking />
        <p className="font-display text-ink mt-4 text-xl font-bold">
          햄찌 판사가 판례 서고를 뒤지는 중이에요…
        </p>
        <p className="text-muted mt-1 text-sm">잠시만 기다려 주세요</p>
      </div>
      <ol className="mx-auto mt-6 flex max-w-[480px] flex-col gap-2">
        {steps.length === 0 && <StepRow n={1} message="분석을 시작하고 있어요" state="진행 중" />}
        {steps.map((s, i) => (
          <StepRow
            key={i}
            n={i + 1}
            message={s.message}
            added={s.added}
            state={i === steps.length - 1 ? "진행 중" : "완료"}
          />
        ))}
      </ol>
    </section>
  );
}

function StepRow({
  n,
  message,
  added,
  state,
}: {
  n: number;
  message: string;
  added?: string[];
  state: "진행 중" | "완료";
}) {
  const done = state === "완료";
  return (
    <li className="rounded-card border-line flex items-start gap-3 border px-4 py-3">
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
          done ? "border-ink bg-ink text-white" : "border-gold text-gold bg-white"
        }`}
      >
        {n}
      </span>
      <div className="flex-1">
        <p className="text-ink text-[15px]">{message}</p>
        {added && added.length > 0 && (
          <p className="text-muted text-[13px]">추가: {added.join(", ")}</p>
        )}
      </div>
      <span className={`text-[13px] ${done ? "text-success-text" : "text-gold"}`}>{state}</span>
    </li>
  );
}

function NoResult({ result, question }: { result: DemoAnalysisResult; question: string | null }) {
  return (
    <section className="rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-8 lg:py-8">
      <AiNotice notice={result.aiNotice} />
      <QuestionQuote text={question} />
      <div className="mt-6 flex flex-col items-center text-center">
        <HamzziJudge size={140} interactive={false} mood="sorry" />
        <h1 className="font-display text-ink mt-4 text-xl font-bold">
          현재 검색 범위에서 비슷한 판례를 찾지 못했어요
        </h1>
        <p className="text-muted mt-2 max-w-[520px] text-[15px] leading-relaxed">
          판례가 없다는 뜻은 아니에요. 표현을 바꾸거나 상황을 조금 더 적어 주시면 다시 찾아볼게요.
        </p>
      </div>
      {result.searchScopeNote && (
        <div className="rounded-card bg-soft mt-6 px-5 py-4">
          <p className="text-ink text-[13px] font-semibold">검색 범위</p>
          <p className="text-muted mt-1 text-sm leading-relaxed">{result.searchScopeNote}</p>
          {result.searches.length > 0 && (
            <p className="text-muted mt-2 text-[13px]">
              검색한 키워드: {result.searches.map((s) => `${s.keyword} ${s.total}건`).join(" · ")}
            </p>
          )}
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          href="/"
          className="rounded-button bg-ink flex min-h-11 items-center px-5 text-[15px] font-semibold text-white"
        >
          다시 적어 보기
        </Link>
        <Link
          href="/#examples"
          className="rounded-button border-line text-ink flex min-h-11 items-center border bg-white px-5 text-[15px]"
        >
          예시 질문 보기
        </Link>
      </div>
      <SourceCredit />
    </section>
  );
}

const PROBLEM_TEXT: Partial<Record<string, { title: string; body: string }>> = {
  SEARCH_UPSTREAM_FAILED: {
    title: "앗, 서고 문이 잠깐 잠겼어요",
    body: "법령·판례를 불러오지 못했어요. 결과가 없는 게 아니라 연결 문제예요.",
  },
  MODEL_FAILED: {
    title: "답변을 만드는 중 문제가 생겼어요",
    body: "잠시 후 다시 시도해 주세요.",
  },
  TIMEOUT: { title: "시간이 너무 오래 걸렸어요", body: "잠시 후 다시 시도해 주세요." },
  RATE_LIMITED: {
    title: "이 네트워크에서 질문을 많이 했어요",
    body: "같은 네트워크에서는 24시간 안에 분석할 수 있는 횟수가 정해져 있어요. 잠시 뒤에 다시 와 주세요.",
  },
  LOGIN_REQUIRED: {
    title: "질문 3번을 모두 썼어요",
    body: DEMO_LIMIT_TEXT,
  },
  NOT_FOUND: {
    title: "결과를 찾을 수 없어요",
    body: "주소가 맞는지 확인해 주세요. 질문을 보낸 기기에서만 결과를 볼 수 있어요.",
  },
  FORBIDDEN: {
    title: "결과를 찾을 수 없어요",
    body: "질문을 보낸 기기에서만 결과를 볼 수 있어요.",
  },
  PII_CONFIRMATION_REQUIRED: {
    title: "가린 문장 확인이 필요해요",
    body: "개인정보로 보이는 내용을 가린 문장으로 분석해요. 적으신 원문은 저장하지 않아요.",
  },
};

const RETRYABLE = new Set(["SEARCH_UPSTREAM_FAILED", "MODEL_FAILED", "TIMEOUT", "INTERNAL_ERROR"]);

function Problem({
  error,
  question,
  onRetry,
  onConfirmPii,
}: {
  error: ClientError;
  question: string | null;
  onRetry: () => void;
  onConfirmPii: () => void;
}) {
  // INTERNAL_ERROR 등은 고정 문구만 (예외 내용 표시 금지)
  const text = PROBLEM_TEXT[error.code] ?? {
    title: "일시적인 오류가 발생했어요",
    body: "잠시 후 다시 시도해 주세요.",
  };
  return (
    <section
      role="alert"
      className="rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-8 lg:py-8"
    >
      <QuestionQuote text={question} />
      <div className="mt-6 flex flex-col items-center text-center">
        <HamzziJudge size={140} interactive={false} mood="sorry" />
        <h1 className="font-display text-ink mt-4 text-xl font-bold">{text.title}</h1>
        <p className="text-muted mt-2 max-w-[520px] text-[15px] leading-relaxed">{text.body}</p>
      </div>

      {error.code === "SEARCH_UPSTREAM_FAILED" && (
        <div className="rounded-card border-note-line bg-note mx-auto mt-6 max-w-[520px] border px-5 py-4 text-center">
          <p className="text-ink text-[15px] font-semibold">
            지금은 예시 질문으로 체험할 수 있어요
          </p>
          <p className="text-muted mt-1 text-sm leading-relaxed">
            예시 질문은 미리 분석하고 법제처 재조회로 인용을 확인해 둔 답변을 보여 드려요.
          </p>
          <Link
            href="/#examples"
            className="rounded-button bg-ink mt-3 inline-flex min-h-11 items-center px-5 text-[15px] font-semibold text-white"
          >
            예시 질문 보기
          </Link>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {RETRYABLE.has(error.code) && (
          <SecondaryButton onClick={onRetry}>다시 시도</SecondaryButton>
        )}
        {error.code === "PII_CONFIRMATION_REQUIRED" && (
          <PrimaryButton onClick={onConfirmPii}>가린 문장으로 분석하기</PrimaryButton>
        )}
        <Link
          href="/"
          className="rounded-button border-line text-ink flex min-h-11 items-center border bg-white px-5 text-[15px]"
        >
          홈으로
        </Link>
      </div>
      {RETRYABLE.has(error.code) && (
        <p className="text-muted mt-3 text-center text-[13px]">
          이번 시도는 질문 횟수에 세지 않아요
        </p>
      )}
      {error.requestId && (
        <p className="text-muted mt-1 text-center text-xs">오류 번호 {error.requestId}</p>
      )}
    </section>
  );
}

function FollowUp({ parentId }: { parentId: string }) {
  const [text, setText] = useState("");
  const quota = useQuota();
  const { busy, error, send, modals, showLimit } = useAsk({ parentInquiryId: parentId });
  const blocked = quota?.loginRequired === true;
  return (
    <section aria-labelledby="follow-title" className="mt-8">
      <h2 id="follow-title" className="font-display text-ink text-[19px] font-bold">
        이어서 물어보기
      </h2>
      <div className="mt-3">
        <QuestionBox
          value={text}
          onChange={setText}
          onSubmit={() => (blocked ? showLimit() : void send(text))}
          busy={busy}
          size="md"
          label="이어서 물어보기"
          placeholder="이 사건에 대해 더 물어보세요"
        />
      </div>
      {error ? (
        <p role="alert" className="text-warn-text mt-2 text-sm">
          {error}
        </p>
      ) : (
        <p className="text-muted mt-2 text-[13px]">
          {quota?.anonymous && quota.remaining !== null
            ? `남은 질문 ${quota.remaining}/${quota.limit} · 이어 묻기도 1번으로 세요`
            : "이어 묻기도 질문 1번으로 세요"}
        </p>
      )}
      {modals}
    </section>
  );
}
