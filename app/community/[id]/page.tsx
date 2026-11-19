// 커뮤니티 글 보기·댓글 (DEC-047). 이용자가 쓴 글이라 검색 엔진에 싣지 않는다.
import type { Metadata } from "next";
import { Suspense } from "react";
import { PostRoute } from "@/components/community/Community";

export const metadata: Metadata = {
  title: "커뮤니티 글 · 햄찌법원",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="bg-bg flex flex-1 flex-col">
      <Suspense>
        <PostRoute />
      </Suspense>
    </main>
  );
}
