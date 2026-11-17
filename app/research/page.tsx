// 판례 리서치 (DEC-029 제안): 검색 → 목록 → 옆 미리보기 → 보관함. 기존 /search와 같은 API를 쓰는 업무용 화면.
import type { Metadata } from "next";
import { Suspense } from "react";
import { ResearchView } from "@/components/search/ResearchView";

export const metadata: Metadata = { title: "판례 리서치 · 햄찌법원" };

export default function Page() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <ResearchView />
      </Suspense>
    </main>
  );
}
