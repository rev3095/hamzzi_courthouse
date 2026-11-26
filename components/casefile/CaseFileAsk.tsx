"use client";
// 사건 정리 화면 /casefile (주 메뉴 '사건' → 정리, DEC-073 ③ — 예전 '서류 분석' F-015·DEC-052): 상황을 적거나 서류 사진을 붙여
// DeepSearch로 정리한다. 사진이 있으면 홈 질문창과 같은 흐름(useCaseFileAsk: 동의 → 읽기 → 확인)이고, 글만 있으면 곧바로
// DeepSearch(deep)로 보낸다. 긴 글(LONG_QUESTION_CHARS 넘게)이면 결과에 7개 탭 사건 정리판(DEC-062)이 붙는다.
// 승패·가능성은 보여 주지 않는다. 결과는 일반 질문과 같은 결과 화면(/inquiries/[id])에서 본다.
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { LONG_QUESTION_CHARS } from "@/lib/ai/models";
import { CASEFILE_LIMITS } from "@/lib/casefile/limits";
import { isQuotaBlocked, isSignedIn } from "@/lib/client/api";
import { dailyLimitLine, limitCopy } from "../LimitNotice";
import { QuestionBox } from "../ask/QuestionBox";
import { useAsk } from "../ask/useAsk";
import { useQuota } from "../useQuota";
import { CaseSwitch } from "../matters/CaseSwitch";
import { useCaseFileAsk } from "./useCaseFileAsk";
import { PAGE_TITLE } from "@/components/ui/styles";

const STEPS = [
  {
    title: "상황 적기 · 서류 붙이기",
    body: `있었던 일을 적거나, 내용증명·소장·계약서·문자 캡처 사진이나 문서를 ${CASEFILE_LIMITS.maxImages}개까지 붙여요.`,
  },
  {
    title: "읽은 내용 확인",
    body: "서류를 붙였으면 AI가 읽은 사건 개요를 개인정보를 가린 채 보여 드려요. 틀린 곳은 직접 고쳐요.",
  },
  {
    title: "DeepSearch 사건 정리",
    body: `법제처 법령·판례를 쟁점별로 찾아 정리해요. ${LONG_QUESTION_CHARS}자 넘게 적으면 사실관계·양쪽 입장·쟁점을 탭으로 나눈 사건 정리판도 함께 나와요.`,
  },
];

/** examples: 예제 프리셋 목록(서버에서 그려 넘긴다) */
export function CaseFileAsk({ examples }: { examples?: ReactNode }) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const quota = useQuota();
  const { busy, error, send, modals, showLimit } = useAsk();
  const blocked = isQuotaBlocked(quota);
  const signedIn = isSignedIn(quota);
  const caseFile = useCaseFileAsk({ send, busy, error, blocked, showLimit });

  const submit = () => {
    setHint(null);
    if (caseFile.start(text)) return;
    // 사진 없이 글만: 곧바로 DeepSearch로 (민감정보 동의는 useAsk가 필요할 때 묻는다)
    if (text.trim()) {
      if (blocked) return showLimit();
      void send(text, false, true);
      return;
    }
    setHint("지금 상황을 적거나 서류 사진을 붙여 주세요.");
  };

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 py-10 lg:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={PAGE_TITLE}>사건 정리</h1>
        <CaseSwitch current="organize" />
      </div>
      <p className="text-muted mt-2 text-[15px] leading-relaxed">
        지금 상황을 적거나 받은 서류의 사진을 올리면, DeepSearch로 사실관계와 쟁점을 정리하고 법제처
        법령·판례 근거와 함께 보여 드려요.
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
          label="지금 상황이나 서류에 대해 궁금한 점"
          placeholder="있었던 일을 적거나 서류 사진을 붙여 주세요 (사진이 있으면 글은 비워도 돼요)"
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
            : `사건 정리도 질문 1번으로 세요. ${dailyLimitLine(signedIn)}`}
        </p>
      )}

      {examples}

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
