// 전문 에이전트 소개 /assistants (F-018, DEC-057). 헤더 ☰ 메뉴의 "전문 에이전트"가 여기로 온다.
// 고정 문안만 쓴다(AI 없음). 모델 이름은 화면에 싣지 않는다(답변 모드 이름만, 2026-11-19 사용자 요청).
import type { Metadata } from "next";
import Link from "next/link";
import { AssistantCards } from "@/components/assistants/AssistantCards";
import { AI_NOTICE } from "@/lib/api/respond";

export const metadata: Metadata = { title: "전문 에이전트 · 햄찌법원" };

const HOW = [
  {
    title: "대화하듯 물어보기",
    body: "있었던 일을 편하게 적으면 에이전트가 먼저 짧게 정리하고, 근거를 더 맞게 찾는 데 필요한 사실을 되물어요. 이 대화 한마디에는 법령·판례·숫자를 넣지 않아요.",
  },
  {
    title: "법령·판례로 정리한 답변",
    // 서버 화면이라 클라이언트 모듈(TierSlider)의 TIER_TEXT를 읽지 않고 이름을 적는다 — ASSISTANT_ANSWER_TIER(max)와 같아야 한다
    body: `이어서 그 분야의 조문과 판례를 법제처에서 찾아 답변 모드 Pro Max로 정리해요. 법제처 근거로 쓴 문단에는 출처와 인용 확인 결과를 달아 드려요.`,
  },
  {
    title: "분야에 맞춘 자료",
    body: "에이전트마다 자주 쓰는 조문과 공개 판례를 먼저 살펴요. 에이전트 페이지 아래 '사례로 보기'에서 공개 판례를 다시 쓴 요지와 가상 사례를 볼 수 있어요.",
  },
];

const RULES = [
  "AI가 만든 무료 법률 상담 답변이에요. 법제처 근거를 먼저 쓰고, 사건의 결과를 확정하지 않아요.",
  "이름·연락처·계좌번호처럼 보이는 부분은 가려서 저장하고, 적으신 원문은 저장하지 않아요.",
  "분석이 끝난 질문마다 질문 1회로 세요. 예시 질문은 세지 않아요.",
  "구체적인 대응은 변호사나 대한법률구조공단 같은 전문가와 상의해 주세요.",
];

export default function AssistantsPage() {
  return (
    <main className="bg-bg flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-10 lg:py-14">
        <p className="text-gold text-[12px] font-semibold tracking-[0.12em]">햄찌법원 · AI</p>
        <h1 className="font-display text-ink mt-2 text-[34px] font-black lg:text-[44px]">
          전문 에이전트
        </h1>
        <p className="text-muted mt-3 max-w-[680px] text-[16px] leading-relaxed">
          자주 묻는 세 분야를 맡은 AI 에이전트예요. 집 계약, 온라인에서 겪은 명예훼손·성적 괴롭힘,
          중고거래 사기를 대화하듯 물어보면 법령·판례를 근거로 정리해 드려요.
        </p>
        <p className="bg-ink mt-4 w-fit rounded-[6px] px-2.5 py-1 text-xs font-semibold text-white">
          {AI_NOTICE}
        </p>

        <div className="mt-8">
          <AssistantCards />
        </div>

        <section aria-labelledby="as-how" className="mt-12">
          <h2 id="as-how" className="font-display text-ink text-[26px] font-bold">
            이렇게 답해요
          </h2>
          <ol className="mt-5 grid gap-4 md:grid-cols-3">
            {HOW.map((h, i) => (
              <li key={h.title} className="rounded-card border-line border bg-white p-5">
                <p className="text-gold text-[13px] font-bold">{i + 1}</p>
                <h3 className="text-ink mt-1 text-[17px] font-bold">{h.title}</h3>
                <p className="text-muted mt-2 text-[15px] leading-relaxed">{h.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="as-rules" className="mt-12">
          <h2 id="as-rules" className="font-display text-ink text-[26px] font-bold">
            꼭 알아 두세요
          </h2>
          <ul className="text-ink mt-4 max-w-[760px] list-disc space-y-2 pl-5 text-[15px] leading-relaxed">
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="text-muted mt-4 text-[14px]">
            챗봇(오른쪽 아래 햄찌 버튼)에서도 맨 위 선택기로 에이전트를 골라 바로 대화할 수 있어요.{" "}
            <Link href="/about/features" className="text-link underline">
              햄찌법원 기능 가이드
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
