// S-01 홈 (Figma 03 "D+ / S-01 홈 · 기본", 02 와이어프레임). 히어로 · 질문창 · 예시 질문 피드 · 약속 배너.
// D+의 CORE 기능 소개·범위 밖 메뉴·칩은 숨긴다 (docs/07 결정 2·3). 부제에서 '기간·비용'은 뺐다 (데모 범위).
import { HamzziJudge } from "@/components/HamzziJudge";
import { HomeAsk } from "@/components/home/HomeAsk";
import { PromiseBanner } from "@/components/PromiseBanner";
import { demoExamples } from "@/lib/demo/policy";

export default function Home() {
  const examples = demoExamples().map(({ id, question, area }) => ({ id, question, area }));
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative mx-auto flex w-full max-w-[1120px] flex-col items-center px-4 pt-10 pb-16 text-center lg:pt-14">
        <div className="border-ink text-ink relative mb-1 rounded-[18px] border bg-white px-4 py-3 text-[15px] font-semibold">
          무슨 일이 있었나요? 편하게 말해 주세요!
          <span
            aria-hidden="true"
            className="border-ink absolute -bottom-[8px] left-1/2 size-[15px] -translate-x-1/2 rotate-45 border-r border-b bg-white"
          />
        </div>
        <div className="mt-3 flex flex-col items-center">
          <HamzziJudge size={230} />
          <div aria-hidden="true" className="border-line bg-line h-2.5 w-[236px] border" />
        </div>
        <p className="border-gold-line text-gold mt-6 rounded-full border bg-white px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.08em]">
          OPEN LEGAL ARCHIVE · AI 법률 길잡이
        </p>
        <h1 className="font-display text-ink mt-3.5 text-[56px] leading-tight font-black lg:text-[72px]">
          햄찌법원
        </h1>
        <p className="font-accent text-gold mt-1 text-xl font-semibold italic">Hamzzi Court</p>
        <span aria-hidden="true" className="bg-gold mt-5 h-[3px] w-16" />
        <p className="font-display text-muted mt-5 max-w-[560px] text-lg leading-relaxed font-medium">
          어려운 법률 용어 대신 일상 언어로.
          <br />
          햄찌 판사가 법령과 판례를 근거로 정리해 드려요.
        </p>
        <div className="mt-9 flex w-full flex-col items-center">
          <HomeAsk examples={examples} />
        </div>
      </section>
      <PromiseBanner />
    </main>
  );
}
