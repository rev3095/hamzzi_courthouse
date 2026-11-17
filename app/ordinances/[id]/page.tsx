// 자치법규 조문 (DEC-026 제안). id = 법제처 자치법규일련번호.
import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdinanceRoute } from "@/components/search/OrdinanceViews";

export const metadata: Metadata = { title: "자치법규 · 햄찌법원" };

export default function Page() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <OrdinanceRoute />
      </Suspense>
    </main>
  );
}
