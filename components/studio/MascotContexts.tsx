"use client";
// 편집기 미리보기: 상태 그림이 실제 화면 안에서 어떻게 보이는지. 결과 화면 카드는 실제 컴포넌트(ResultView)를 그대로 쓴다.
// 미리보기 영역은 inert라 링크·버튼이 동작하지 않는다.
import { STEP_MESSAGES, type StepEvent } from "@/lib/ai/policy";
import { AI_NOTICE } from "@/lib/api/respond";
import { MOOD_INFO, type MascotMood } from "@/lib/mascot/moods";
import { HamzziBadge, HamzziJudge } from "../HamzziJudge";
import { DEMO_LIMIT_TEXT, DEMO_LIMIT_TITLE } from "../LimitNotice";
import { Analyzing, NoResult, Problem } from "../result/ResultView";

export type ContextKey =
  "home" | "analyzing" | "error" | "noresult" | "rate" | "limit" | "pii" | "result" | "bubble";

export const CONTEXT_LABEL: Record<ContextKey, string> = {
  home: "홈 히어로",
  analyzing: "분석 진행",
  error: "오류 카드",
  noresult: "결과 없음",
  rate: "하루 상한",
  limit: "질문 한도 안내",
  pii: "가린 문장 확인",
  result: "결과 머리 아이콘",
  bubble: "말풍선 카드",
};

/** 상태마다 보여 줄 화면 맥락. 실제로 그 상태를 쓰는 화면이 먼저 온다 */
export const MOOD_CONTEXTS: Record<MascotMood, ContextKey[]> = {
  default: ["home", "bubble"],
  thinking: ["analyzing", "bubble"],
  done: ["result", "bubble"],
  ask: ["pii", "bubble"],
  curious: ["bubble"],
  sorry: ["noresult", "rate", "limit", "bubble"],
  error: ["error", "bubble"],
  calm: ["bubble"],
};

const QUESTION = "친구에게 빌려준 돈을 몇 달째 돌려받지 못하고 있어요.";
const STEPS: StepEvent[] = [
  { stage: "intent", message: STEP_MESSAGES.intent },
  { stage: "search", message: STEP_MESSAGES.search },
];
const noop = () => {};

export function MascotContext({ context, mood }: { context: ContextKey; mood: MascotMood }) {
  switch (context) {
    case "home":
      return (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="border-ink text-ink relative mb-1 rounded-[18px] border bg-white px-4 py-3 text-[15px] font-semibold">
            {MOOD_INFO.default.line}
            <span
              aria-hidden="true"
              className="border-ink absolute -bottom-[8px] left-1/2 size-[15px] -translate-x-1/2 rotate-45 border-r border-b bg-white"
            />
          </div>
          <div className="mt-3 flex flex-col items-center">
            <HamzziJudge size={230} mood={mood} interactive={false} />
            <div aria-hidden="true" className="border-line bg-line h-2.5 w-[236px] border" />
          </div>
          <p className="font-display text-ink mt-5 text-[44px] leading-tight font-black">
            햄찌법원
          </p>
        </div>
      );
    case "analyzing":
      return <Analyzing question={QUESTION} steps={STEPS} />;
    case "error":
      return (
        <Problem
          error={{ code: "SEARCH_UPSTREAM_FAILED", message: "" }}
          question={QUESTION}
          onRetry={noop}
          onConfirmPii={noop}
        />
      );
    case "rate":
      return (
        <Problem
          error={{ code: "RATE_LIMITED", message: "" }}
          question={QUESTION}
          onRetry={noop}
          onConfirmPii={noop}
        />
      );
    case "pii":
      return (
        <Problem
          error={{ code: "PII_CONFIRMATION_REQUIRED", message: "" }}
          question={QUESTION}
          onRetry={noop}
          onConfirmPii={noop}
        />
      );
    case "noresult":
      return (
        <NoResult
          result={{
            aiNotice: AI_NOTICE,
            searchScopeNote: "",
            searches: [],
          }}
          question={QUESTION}
        />
      );
    case "limit":
      // LimitNotice는 화면 전체를 덮는 창이라, 창 안쪽 모습만 같은 모양으로 그린다
      return (
        <div className="flex justify-center py-6">
          <div className="rounded-panel border-line w-full max-w-[440px] border bg-white p-6 shadow-xl">
            <p className="font-display text-ink text-xl font-bold">{DEMO_LIMIT_TITLE}</p>
            <div className="mt-3 flex justify-center">
              <HamzziJudge size={88} mood={mood} interactive={false} />
            </div>
            <p className="text-muted mt-3 text-[15px] leading-relaxed">{DEMO_LIMIT_TEXT}</p>
            <div className="rounded-button border-line text-ink mt-5 flex min-h-11 items-center justify-center border bg-white text-[15px]">
              닫기
            </div>
          </div>
        </div>
      );
    case "result":
      // ResultPanel 머리줄과 같은 모양. 얼굴은 manifest.faces(전신 그림과 따로)를 쓴다
      return (
        <div className="rounded-panel border-line border bg-white px-[18px] py-[22px]">
          <p className="bg-ink w-fit rounded-[6px] px-2.5 py-1 text-xs font-semibold text-white">
            {AI_NOTICE}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <HamzziBadge size={52} mood={mood} />
            <div>
              <p className="text-ink text-[15px] font-bold">햄찌 판사의 정리</p>
              <p className="text-muted text-[13px]">AI 캐릭터 · 근거 법령·판례 인용</p>
            </div>
          </div>
          <div className="bg-soft mt-4 h-3 w-2/3 rounded-full" />
          <div className="bg-soft mt-2 h-3 w-1/2 rounded-full" />
        </div>
      );
    case "bubble": {
      const line = MOOD_INFO[mood].line;
      return (
        <div className="rounded-panel border-line flex flex-col items-center border bg-white px-6 py-8 text-center">
          {line ? (
            <p className="border-ink text-ink relative mb-4 rounded-[18px] border bg-white px-4 py-3 text-[15px] font-semibold">
              {line}
              <span
                aria-hidden="true"
                className="border-ink absolute -bottom-[8px] left-1/2 size-[15px] -translate-x-1/2 rotate-45 border-r border-b bg-white"
              />
            </p>
          ) : (
            <p className="text-muted mb-4 text-sm">(대사 없이 차분한 표정만)</p>
          )}
          <HamzziJudge size={160} mood={mood} interactive={false} />
        </div>
      );
    }
  }
}
