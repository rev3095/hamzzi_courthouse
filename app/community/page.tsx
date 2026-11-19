// 커뮤니티 (DEC-047): 자유게시판·법 제도 의견·가정 질문 등 게시판. 비로그인도 쓰고, 로그인하면 씨앗이 쌓인다.
import type { Metadata } from "next";
import { Suspense } from "react";
import { CommunityBoard } from "@/components/community/Community";

export const metadata: Metadata = { title: "커뮤니티 · 햄찌법원" };

export default function Page() {
  return (
    <main className="bg-bg flex flex-1 flex-col">
      <Suspense>
        <CommunityBoard />
      </Suspense>
    </main>
  );
}
