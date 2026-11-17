// 결정문 상세 (DEC-026 제안): 법령해석례·헌재 결정례·조세심판 재결례·관세청 해석. 법제처 실시간 조회, 요지 항목만.
import type { Metadata } from "next";
import { Suspense } from "react";
import { DecisionRoute } from "@/components/search/DetailViews";

export const metadata: Metadata = { title: "결정문 · 햄찌법원" };

export default function Page() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <DecisionRoute />
      </Suspense>
    </main>
  );
}
