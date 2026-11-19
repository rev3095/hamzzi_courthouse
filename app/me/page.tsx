// 마이페이지 (DEC-032): 헤더 오른쪽 위 프로필 아이콘으로 연다. Google 로그인(DEC-035)·햄찌 안내 챗봇 끄기·내 기록.
import type { Metadata } from "next";
import { MyPage } from "@/components/me/MyPage";

export const metadata: Metadata = {
  title: "마이페이지 · 햄찌법원",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="bg-bg flex flex-1 flex-col">
      <MyPage />
    </main>
  );
}
