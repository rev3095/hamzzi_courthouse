// 예시 생성용 로컬 서버 띄우기 (유료 생성 스크립트 전용, 개발 DB). 작업 폴더(worktree)에 .env.local이 없을 때
// 원래 체크아웃의 .env.local을 읽어 next dev를 띄운다. 값은 출력하지 않는다.
// 사용: node scripts/gen-server.mjs <.env.local 경로> [포트]
// 운영 DB를 가리키는 .env 파일로는 실행하지 않는다 — 예산 카운터를 운영과 함께 쓰면 실사용자가 무료 모드로 떨어질 수 있다.
// 이번 실행만 유료 모드·예산 한도를 덮어쓴다(AI_MODE=paid, 기간·주간 예산 $400) — .env.local은 고치지 않는다.
import { spawn } from "node:child_process";

process.loadEnvFile(process.argv[2]);
Object.assign(process.env, {
  AI_MODE: "paid",
  AI_PERIOD_BUDGET_USD: "400",
  AI_WEEKLY_BUDGET_USD: "400",
  NEXT_TELEMETRY_DISABLED: "1",
});
const port = process.argv[3] ?? "3100";
spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", port], {
  stdio: "inherit",
  env: process.env,
}).on("exit", (code) => process.exit(code ?? 0));
