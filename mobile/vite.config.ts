// 앱 화면 빌드 (DEC-048). 저장소의 순수 규칙(lib/reader·lib/procedure·lib/pii)과 예시 답변을 그대로 묶는다.
// 결과(dist)는 Capacitor가 android·ios 프로젝트에 복사한다. 상대 경로(base ./)라 앱 안 파일로 열린다.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repo = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": repo } },
  server: { port: 5190, fs: { allow: [repo] } },
  // 예시 답변 45건(약 500KB)이 함께 들어가 한 덩어리가 크다 — 앱 안 파일이라 내려받는 시간은 없다
  build: { outDir: "dist", emptyOutDir: true, target: "es2020", chunkSizeWarningLimit: 1200 },
});
