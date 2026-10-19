// Claude Code 개발용 korean-law-mcp(stdio) 실행기. .mcp.json에서 호출한다.
// 법제처 OC 키를 .env.local에서 읽어 LAW_OC로 넘긴다 (LAW_OC가 없으면 수집기와 같은 OPEN_LAW_API_KEY).
// 키 값은 출력하지 않는다. stdout은 MCP 프로토콜 전용이라 안내는 stderr로만 쓴다.
// 서비스 런타임에서는 쓰지 않는다 — 서비스 내 사용 여부는 PRD 16.1 오픈 이슈.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvLocal() {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

const local = readEnvLocal();
const key = process.env.LAW_OC || local.LAW_OC || local.OPEN_LAW_API_KEY || "";
if (!key) {
  process.stderr.write(
    "[korean-law-mcp] .env.local에 LAW_OC(또는 OPEN_LAW_API_KEY)가 없습니다. 법제처 API 호출이 실패합니다.\n",
  );
}

const entry = path.join(root, "node_modules", "korean-law-mcp", "build", "index.js");
const child = spawn(process.execPath, [entry], {
  cwd: root,
  env: { ...process.env, LAW_OC: key },
  stdio: "inherit",
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
