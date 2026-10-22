// 실제 법제처 호출 스모크 테스트 (pnpm test:live). 네트워크·등록 IP·인증키가 필요해 기본 pnpm test에서 뺀다.
// .env.local에서 OPEN_LAW_API_KEY·ANTHROPIC_API_KEY만 읽어 테스트 환경변수로 넘긴다. 값은 출력하지 않는다.
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
    include: ["tests/live/**/*.live.test.ts"],
    // Claude API는 Pro 구독과 별개로 과금된다(Console API 크레딧). ALLOW_PAID_API=1을 명시할 때만 키를 넘기고,
    // 아니면 빈 값으로 덮어 Claude 실호출 테스트·평가가 건너뛰어지게 한다 (2026-10-22 사용자 지시: 별도 과금 금지)
    env: {
      ...readKey("OPEN_LAW_API_KEY"),
      ...(process.env.ALLOW_PAID_API === "1" ? readKey("ANTHROPIC_API_KEY") : { ANTHROPIC_API_KEY: "" }),
    },
    testTimeout: 90_000,
  },
});
