import type { MetadataRoute } from "next";

// 웹 앱 매니페스트 — Android 앱(TWA)의 이름·아이콘·색 기준 (docs/08_Google_Play_배포.md).
// 색은 브랜드 토큰(docs/05_브랜드_가이드.md 3절): theme = --bg, background(시작 화면) = --cream.
// 아이콘은 scripts/make_app_icons.py가 만든다. 바꾸면 twa/twa-manifest.json도 같이 맞춘다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "햄찌법원",
    short_name: "햄찌법원",
    description: "법령·판례를 근거로 내 법률 문제를 정리해 주는 AI 법률 정보 서비스",
    lang: "ko",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#faf9f6",
    background_color: "#f4eee1",
    categories: ["education", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
