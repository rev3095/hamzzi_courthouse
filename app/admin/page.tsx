// 관리자 모드 (DEC-024). 비밀번호를 넣으면 이 브라우저에서 질문 횟수 제한 없이 쓸 수 있다.
// 메뉴에 링크를 두지 않는다. 검색에 노출하지 않는다.
import type { Metadata } from "next";
import { AdminLabels } from "@/components/AdminLabels";
import { AdminLogin } from "@/components/AdminLogin";

export const metadata: Metadata = {
  title: "관리자 · 햄찌법원",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="bg-bg flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[640px] px-4 py-12">
        <article className="rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-8 lg:py-8">
          <h1 className="font-display text-ink text-[24px] font-bold">관리자 모드</h1>
          <p className="text-muted mt-2 text-[15px] leading-relaxed">
            관리자 모드에서는 이 브라우저에서 질문 횟수 제한 없이 쓸 수 있어요. 질문 1건 비용 상한과
            주간 전체 비용 상한은 그대로예요.
          </p>
          <AdminLogin />
          <AdminLabels />
        </article>
      </div>
    </main>
  );
}
