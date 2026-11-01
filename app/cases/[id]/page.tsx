// 판례 상세 (F-003 AC3). 법제처 실시간 조회, 판결문 전문은 저장·표시하지 않는다 (DEC-007).
import type { Metadata } from "next";
import { Suspense } from "react";
import { CaseRoute } from "@/components/search/DetailViews";

export const metadata: Metadata = { title: "판례 · 햄찌법원" };

export default function CasePage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <CaseRoute />
      </Suspense>
    </main>
  );
}
