// 판례 검색 (F-003, DEC-017 제안). 검색어는 주소(?q=)에 두고 브라우저에서 불러온다.
import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchView } from "@/components/search/SearchView";

export const metadata: Metadata = { title: "판례 검색 · 햄찌법원" };

export default function SearchPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <SearchView />
      </Suspense>
    </main>
  );
}
