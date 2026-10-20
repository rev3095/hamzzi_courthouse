// 개발용 Supabase 프로젝트에 마이그레이션 적용 (Docker 없이). `.env.local`의 SUPABASE_DB_URL을 쓴다.
// 사용: pnpm db:push --dry-run (먼저 확인) → pnpm db:push. 운영 DB 주소로는 실행하지 않는다.
// 접속 주소는 출력에서 가린다.
import { spawnSync } from "node:child_process";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL이 없습니다. .env.local을 확인하세요.");
  process.exit(2);
}

const args = [
  "exec",
  "supabase",
  "db",
  "push",
  "--db-url",
  url,
  "--include-all",
  ...process.argv.slice(2),
];
if (!args.includes("--dry-run")) args.push("--yes");

const r = spawnSync("pnpm", args, { encoding: "utf8", shell: process.platform === "win32" });
const redact = (s) => (s ?? "").replace(/postgres(ql)?:\/\/\S+/g, "postgresql://***");
process.stdout.write(redact(r.stdout));
process.stderr.write(redact(r.stderr));
process.exit(r.status ?? 1);
