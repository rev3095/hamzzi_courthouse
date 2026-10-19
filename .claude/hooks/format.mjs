// PostToolUse(Edit|Write): 수정된 파일을 포맷·린트한다. 실패해도 작업을 막지 않는다.
import { spawnSync } from "node:child_process";
import path from "node:path";

const input = JSON.parse(await new Response(process.stdin).text());
const file = input.tool_response?.filePath ?? input.tool_input?.file_path;
if (!file) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = path.relative(root, file);
if (rel.startsWith("..") || rel.startsWith("node_modules")) process.exit(0);

const run = (cmd, args, cwd = root) =>
  spawnSync([cmd, ...args].join(" "), { cwd, shell: true, stdio: "inherit" });
const ext = path.extname(file);

if ([".ts", ".tsx", ".js", ".mjs", ".css", ".json"].includes(ext)) {
  run("pnpm", ["exec", "prettier", "--write", "--ignore-unknown", `"${file}"`]);
}
if ([".ts", ".tsx", ".js", ".mjs"].includes(ext)) {
  run("pnpm", ["exec", "eslint", "--fix", `"${file}"`]);
}
if (ext === ".py" && rel.startsWith("collector")) {
  run("uv", ["run", "ruff", "format", `"${file}"`], path.join(root, "collector"));
}
