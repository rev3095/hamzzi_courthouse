// 앱 화면 빌드 (DEC-048·049). 저장소의 순수 규칙(lib/reader·lib/procedure·lib/pii·lib/community·lib/guide)과 예시 답변을 그대로 묶는다.
// 결과(dist)는 Capacitor가 android·ios 프로젝트에 복사한다. 상대 경로(base ./)라 앱 안 파일로 열린다.
// - APP_PREVIEW=1: 그림까지 한 덩어리에 넣어 dist-preview에 만든다 → scripts/build-app-preview.mjs가 한 파일(HTML)로 합친다.
// - 개발 서버: VITE_API_BASE=/api/v1 과 APP_API_PROXY=http://localhost:3100 을 주면 로컬 서버로 온라인 기능을 확인한다.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repo = fileURLToPath(new URL("..", import.meta.url));
const preview = process.env.APP_PREVIEW === "1";
const proxy = process.env.APP_API_PROXY;

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": repo } },
  server: {
    port: 5190,
    fs: { allow: [repo] },
    ...(proxy && { proxy: { "/api": { target: proxy, changeOrigin: true } } }),
  },
  // 예시 답변 45건(약 500KB)이 함께 들어가 한 덩어리가 크다 — 앱 안 파일이라 내려받는 시간은 없다
  build: {
    outDir: preview ? "dist-preview" : "dist",
    emptyOutDir: true,
    target: "es2020",
    chunkSizeWarningLimit: 2400,
    ...(preview && { assetsInlineLimit: 100_000_000, cssCodeSplit: false }),
  },
});
