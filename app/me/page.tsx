// 마이페이지 — 내 질문 기록 (DEC-035). 로그인 사용자가 남기기로 한 질문과 답변을 다시 보고 이어서 묻는다.
// 검색에 노출하지 않는다.
import type { Metadata } from "next";
import { MyInquiries } from "@/components/MyInquiries";

export const metadata: Metadata = {
  title: "내 질문 기록 · 햄찌법원",
  robots: { index: false, follow: false },
};

export default function MyPage() {
  return (
    <main className="bg-bg flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[720px] px-4 py-10">
        <h1 className="font-display text-ink text-[24px] font-bold">내 질문 기록</h1>
        <p className="text-muted mt-2 text-[15px] leading-relaxed">
          &lsquo;내 기록에 남기기&rsquo;를 켜고 보낸 질문만 모여요. 가린 문장과 답변만 보관하고,
          보관 기간이 지나면 지워져요. 예시 질문은 기록에 남지 않아요.
        </p>
        <MyInquiries />
      </div>
    </main>
  );
}
