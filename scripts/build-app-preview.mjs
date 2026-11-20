// 앱 화면을 한 파일(HTML)로 만든다 (DEC-049). 웹 게시본(claude.ai artifact)·메일 첨부처럼 파일 하나만 옮길 때 쓴다.
// 사용: node scripts/build-app-preview.mjs  → mobile/dist-preview/app.html
// 스크립트·스타일·그림을 모두 문서 안에 넣는다. 글꼴만 인터넷이 있을 때 Google Fonts에서 받는다.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = path.join(root, "mobile", "dist-preview");
execFileSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build", "--config", "mobile/vite.config.ts"],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, APP_PREVIEW: "1" },
  },
);

let html = readFileSync(path.join(out, "index.html"), "utf8");
const read = (ref) => readFileSync(path.join(out, ref.replace(/^\.\//, "")), "utf8");
html = html.replace(
  /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_, href) => `<style>${read(href)}</style>`,
);
html = html.replace(
  /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  // 문서 안에 넣은 스크립트가 중간에 끝나지 않게 닫는 태그 모양을 바꾼다
  (_, src) => `<script type="module">${read(src).replace(/<\/script/g, "<\/script")}</script>`,
);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, "");
if (/(src|href)="\.\/assets\//.test(html))
  throw new Error("문서 밖 파일을 가리키는 참조가 남았습니다.");
const file = path.join(out, "app.html");
writeFileSync(file, html);
console.log(`app preview: ${file} (${Math.round(html.length / 1024)} KB)`);
