// S-03·S-04·S-07 결과 화면 (docs/07 결정 1: 결과는 별도 주소). 소유자 확인은 API가 한다.
// 결과는 브라우저에서 불러오므로 페이지 틀은 미리 렌더링하고, 주소의 id는 클라이언트에서 읽는다.
import type { Metadata } from "next";
import { Suspense } from "react";
import { ResultRoute } from "@/components/result/ResultView";

export const metadata: Metadata = {
  title: "햄찌 판사의 정리 · 햄찌법원",
  robots: { index: false, follow: false },
};

export default function InquiryPage() {
  return (
    <main className="bg-bg flex flex-1 flex-col">
      <Suspense>
        <ResultRoute />
      </Suspense>
    </main>
  );
}
