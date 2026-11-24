"use client";
// 서류 분석 화면 /casefile (F-015, DEC-052): 서류 사진을 붙이고 궁금한 점을 적어 분석을 시작한다.
// 홈 질문창과 같은 질문창·같은 흐름(useCaseFileAsk)이고, 여기서는 사진이 있어야 보낼 수 있다.
// 승패·가능성은 보여 주지 않는다. 결과는 일반 질문과 같은 결과 화면(/inquiries/[id])에서 본다.
import Link from "next/link";
import { useState } from "react";
import { CASEFILE_LIMITS } from "@/lib/casefile/limits";
import { isQuotaBlocked, isSignedIn } from "@/lib/client/api";
import { ANON_QUESTION_LIMIT, USER_QUESTION_LIMIT } from "@/lib/inquiries/policy";
import { limitCopy } from "../LimitNotice";
import { QuestionBox } from "../ask/QuestionBox";
import { useAsk } from "../ask/useAsk";
import { useQuota } from "../useQuota";
import { useCaseFileAsk } from "./useCaseFileAsk";

const STEPS = [
  {
    title: "서류 사진 붙이기",
    body: `내용증명·소장·고소장·계약서·문자 캡처를 ${CASEFILE_LIMITS.maxImages}장까지 붙여요.`,
  },
  {
    title: "읽은 내용 확인",
    body: "AI가 읽은 사건 개요를 개인정보를 가린 채 보여 드려요. 틀린 곳은 직접 고쳐요.",
  },
  {
    title: "쟁점·근거·절차 보기",
    body: "법제처 법령·판례를 찾아 쟁점별 근거와 진행 절차를 정리해요.",
  },
];

export function CaseFileAsk() {
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const quota = useQuota();
  const { busy, error, send, modals, showLimit } = useAsk();
  const blocked = isQuotaBlocked(quota);
  const signedIn = isSignedIn(quota);
  const caseFile = useCaseFileAsk({ send, busy, error, blocked, showLimit });

  const submit = () => {
    setHint(null);
    if (!caseFile.start(text))
      setHint("먼저 서류 사진을 붙여 주세요. 왼쪽 사진 버튼을 누르거나 사진을 끌어다 놓으면 돼요.");
  };

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 py-10 lg:py-14">
      <h1 className="font-display text-ink text-[28px] leading-snug font-bold lg:text-[32px]">
        서류 분석
      </h1>
      <p className="text-muted mt-2 text-[15px] leading-relaxed">
        받은 서류나 변호사에게 낸 자료의 사진을 올리면, 지금 상황을 다시 정리하고 쟁점과 진행 절차를
        법제처 법령·판례 근거와 함께 보여 드려요.
      </p>

      <ol className="mt-5 grid gap-2 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-card border-line border bg-white px-4 py-3">
            <p className="text-label text-[12px] font-semibold">{i + 1}단계</p>
            <p className="text-ink mt-0.5 text-[15px] font-semibold">{s.title}</p>
            <p className="text-muted mt-1 text-[13px] leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        <QuestionBox
          value={text}
          onChange={setText}
          onSubmit={submit}
          busy={busy}
          label="서류에 대해 궁금한 점"
          placeholder="서류에 대해 궁금한 점을 적어 주세요 (비워도 돼요)"
          askTools
          attach={caseFile.attach}
        />
      </div>
      {caseFile.flow}
      {(hint ?? error) ? (
        <p role="alert" className="text-warn-text mt-3 text-center text-sm">
          {hint ?? error}
        </p>
      ) : (
        <p className="text-muted mt-3 text-center text-[13px] leading-relaxed">
          {blocked
            ? limitCopy(signedIn).body
            : `서류 분석도 질문 1번으로 세요. ${signedIn ? "오늘은" : "데모에서는"} 하루 ${signedIn ? USER_QUESTION_LIMIT : ANON_QUESTION_LIMIT}번까지 물어볼 수 있어요.`}
        </p>
      )}

      <section className="rounded-card border-line bg-soft mt-8 border px-5 py-4">
        <h2 className="text-ink text-[15px] font-semibold">알아 두세요</h2>
        <ul className="text-muted mt-2 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed">
          <li>
            사진은 동의를 받은 뒤에만 AI에게 보내고, 서버에 저장하지 않아요. 읽은 내용은 개인정보를
            가린 사건 개요만 남겨요.
          </li>
          <li>
            당사자는 서류에 적힌 역할(발신인·수신인, 원고·피고 등)로만 나눠 보여 드려요. 누가
            옳은지, 결과가 어떻게 될지는 판단하지 않아요.
          </li>
          <li>
            개인은 이름을 보여 주지 않고 찾아보지도 않아요. 법인·사업자는 결과 화면에서 공개된
            정보(상호·주소·업종)를 찾아볼 수 있어요.
          </li>
          <li>
            기한이 정해진 서류(지급명령·소장 등)를 받았다면 서류에 적힌 기한을 먼저 확인하고 전문가
            상담을 우선 알아보세요.
          </li>
        </ul>
        <p className="mt-2 text-[13px]">
          <Link href="/privacy" className="text-link underline-offset-2 hover:underline">
            개인정보처리방침 보기
          </Link>
        </p>
      </section>
      {modals}
    </div>
  );
}
