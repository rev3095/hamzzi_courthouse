// 햄찌법원 편집기 (개발 전용). `pnpm dev`에서만 열리고 배포(production)에서는 404다.
// 마스코트 상태별 그림 교체(저장은 /api/dev/studio/mascot) + 발표 자료 디자인. 공개 화면이 아니다.
import type { Metadata } from "next";
import { Nanum_Myeongjo, Noto_Sans_KR } from "next/font/google";
import { notFound } from "next/navigation";
import { Studio } from "@/components/studio/Studio";

// 발표 자료 디자인 탭 글꼴 (IBM Plex Sans KR은 layout에서 이미 불러온다)
const notoKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  preload: false,
});
const myeongjo = Nanum_Myeongjo({
  variable: "--font-nanum-myeongjo",
  weight: ["700", "800"],
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "햄찌법원 편집기",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className={`${notoKr.variable} ${myeongjo.variable}`}>
      <Studio />
    </div>
  );
}
