// PreToolUse(Edit|Write): 비밀값 파일 편집을 막는다 (CLAUDE.md 금지 항목). .env.example은 허용.
import path from "node:path";

const input = JSON.parse(await new Response(process.stdin).text());
const file = input.tool_input?.file_path ?? "";
const name = path.basename(file).toLowerCase();
const parts = file.toLowerCase().split(/[\\/]/);

const blocked =
  (/^\.env(\..+)?$/.test(name) && name !== ".env.example") ||
  /\.(pem|key|p12|pfx)$/.test(name) ||
  parts.includes("secrets");

if (blocked) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `비밀값 파일(${name})은 Claude가 편집하지 않습니다. 직접 수정하세요.`,
      },
    }),
  );
}
