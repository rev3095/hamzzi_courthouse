import type { Metadata } from "next";
import { IBM_Plex_Sans_KR, Noto_Serif_KR, Playfair_Display } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const plexKr = IBM_Plex_Sans_KR({
  variable: "--font-plex-kr",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  preload: false,
});

const serifKr = Noto_Serif_KR({
  variable: "--font-serif-kr",
  weight: ["500", "700", "900"],
  subsets: ["latin"],
  preload: false,
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  style: ["italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "햄찌법원",
  description: "법령·판례를 근거로 내 법률 문제를 정리해 주는 AI 법률 정보 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${plexKr.variable} ${serifKr.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
