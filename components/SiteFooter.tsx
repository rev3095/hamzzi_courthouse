// 공통 푸터 · 법적 고지 (Figma 05 "푸터 · 법적 고지", PRD 10 고지, 절대 규칙 6)
import Link from "next/link";
import { HamzziFace } from "./HamzziJudge";

export function SiteFooter() {
  return (
    <footer className="border-line bg-bg mt-auto border-t">
      <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-3 px-4 py-6 text-center">
        <HamzziFace size={28} />
        <p className="text-muted max-w-[720px] text-[13px] leading-relaxed">
          ⚖ 법적 고지 · 햄찌법원은 법률 정보 제공을 위한 참고용 서비스이며 법률 자문을 대체하지
          않습니다. 햄찌 판사는 AI 캐릭터입니다. 중요한 결정 전에는 변호사·법무사와 상담하세요.
        </p>
        <nav
          aria-label="정책"
          className="text-muted flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px]"
        >
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
