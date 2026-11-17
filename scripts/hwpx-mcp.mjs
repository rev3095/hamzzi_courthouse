// Claude Code 개발용 hwpx-mcp-server(stdio, MIT, github.com/flamingo8006/hwpx-mcp) 실행기. .mcp.json에서 호출한다.
// 용도: 서식 내보내기(DEC-025)로 만든 .hwpx 파일을 개발 중에 열어 구조를 검사한다. 서비스 런타임에서는 쓰지 않는다
// (사용자 문서는 브라우저 안에서만 만든다 — 이름·주소·금액을 외부 도구·서버로 보내지 않는다).
// 버전을 고정해 npx로 띄운다. Windows는 npx가 .cmd라 셸을 거친다. stdout은 MCP 프로토콜 전용이다.
import { spawn } from "node:child_process";

const VERSION = "0.5.6";
const child = spawn("npx", ["-y", `hwpx-mcp-server@${VERSION}`], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
