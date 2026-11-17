// 법령 도구 (DEC-029 제안): 3단 비교·신구조문 대조·개정 연혁·별표·연계·위임 점검. name = 법령명 (URL 인코딩).
import type { Metadata } from "next";
import { Suspense } from "react";
import { LawRoute } from "@/components/search/LawTools";

export const metadata: Metadata = { title: "법령 도구 · 햄찌법원" };

export default function Page() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <LawRoute />
      </Suspense>
    </main>
  );
}
