import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:3000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    // E2E는 유료 답변을 부르지 않는다 (DEC-036: 키가 있으면 유료가 기본이라 여기서 끈다).
    // 이미 떠 있는 서버를 재사용할 때는 그 서버를 AI_MODE=free로 띄웠는지 확인한다
    env: { AI_MODE: "free" },
  },
});
