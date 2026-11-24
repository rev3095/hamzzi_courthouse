// 공통 푸터 · 법적 고지 (Figma 05 "푸터 · 법적 고지", PRD 10 고지, 절대 규칙 6)
import Link from "next/link";
import { HamzziFace } from "./HamzziJudge";

export function SiteFooter() {
  return (
    <footer className="border-line bg-bg mt-auto border-t">
      <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-3 px-4 py-6 text-center">
        <HamzziFace size={28} />
        <p className="text-muted max-w-[720px] text-[13px] leading-relaxed">
          ⚖ 햄찌법원은 협업 변호사의 자문을 받아 운영하는 무료 법률 상담·문서 대리 작성 서비스이며
          수익을 받지 않습니다. 햄찌 판사는 AI 캐릭터입니다. AI 답변이라 빠진 자료가 있을 수 있어요.
        </p>
        <nav
          aria-label="정책"
          className="text-muted flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px]"
        >
          <Link href="/about" className="underline-offset-2 hover:underline">
            소개
          </Link>
          <Link href="/about/developer#contact" className="underline-offset-2 hover:underline">
            문의
          </Link>
          <Link href="/privacy" className="underline-offset-2 hover:underline">
            개인정보처리방침
          </Link>
          <Link href="/terms" className="underline-offset-2 hover:underline">
            이용약관
          </Link>
          <Link href="/sources" className="underline-offset-2 hover:underline">
            출처 표기
          </Link>
          <Link href="/privacy#delete" className="underline-offset-2 hover:underline">
            내 기록 지우기
          </Link>
        </nav>
      </div>
    </footer>
  );
}
