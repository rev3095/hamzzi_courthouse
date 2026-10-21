// P9 데모 평가 실행 설정 (pnpm eval:demo). 과금되는 실호출이라 기본 pnpm test에서 뺀다.
// .env.local에서 OPEN_LAW_API_KEY·ANTHROPIC_API_KEY만 읽어 넘긴다. 값은 출력하지 않는다.
import fs from "node:fs";
import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

function readKey(name: string): Record<string, string> {
  if (process.env[name]) return { [name]: process.env[name] };
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m?.[1] === name) return { [name]: m[2].replace(/^(['"])(.*)\1$/, "$2") };
  }
  return {};
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    env: { ...readKey("OPEN_LAW_API_KEY"), ...readKey("ANTHROPIC_API_KEY") },
    testTimeout: 60 * 60_000,
  },
});
