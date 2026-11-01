// 결과 화면 공통 조각: AI 고지(절대 규칙 6), 질문 인용, 법제처 출처 표기(docs/07 결정 4)
import { AI_NOTICE } from "@/lib/api/respond";

export function AiNotice({ notice = AI_NOTICE }: { notice?: string }) {
  return (
    <p className="bg-ink w-fit rounded-[6px] px-2.5 py-1 text-xs font-semibold text-white">
      {notice}
    </p>
  );
}

/** 사용자가 보낸 질문의 마스킹본. 이 기기에 없으면 표시하지 않는다 */
export function QuestionQuote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="rounded-card bg-soft text-ink mt-4 px-4 py-3 text-[15px] leading-relaxed">
      “{text}”
    </p>
  );
}

export function SourceCredit({ note }: { note?: string }) {
  return (
    <section
      aria-label="출처"
      className="border-line text-muted mt-6 border-t pt-4 text-[13px] leading-relaxed"
    >
      <p>출처: 법제처 국가법령정보센터 · 각 항목의 &lsquo;원문 보기&rsquo;에서 확인할 수 있어요.</p>
      {note && <p className="mt-1">{note}</p>}
      <p className="mt-2">
        ⚖ 햄찌 판사는 AI 캐릭터이며 실제 판사·변호사가 아닙니다. 햄찌법원은 법률 정보를 제공할 뿐
        법률 자문을 하지 않습니다. 중요한 결정 전에는 변호사·법무사와 상담하세요.
      </p>
    </section>
  );
}
