// 자치법규 나란히 보기 (DEC-026 제안). ?a=&b= 자치법규일련번호 두 개.
import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdinanceCompareRoute } from "@/components/search/OrdinanceViews";

export const metadata: Metadata = { title: "자치법규 나란히 보기 · 햄찌법원" };

export default function Page() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <OrdinanceCompareRoute />
      </Suspense>
    </main>
  );
}
