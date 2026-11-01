// 조문 + 시행일 (F-004). id = "법령명:제N조" (URL 인코딩).
import type { Metadata } from "next";
import { Suspense } from "react";
import { StatuteRoute } from "@/components/search/DetailViews";

export const metadata: Metadata = { title: "조문 · 햄찌법원" };

export default function StatutePage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <StatuteRoute />
      </Suspense>
    </main>
  );
}
