// POST /api/v1/search-answer — 판례·법령 검색 '물어보기' AI 답 (DEC-076). 본문 { q, mode: search|research, focus: cases|laws }.
// 검색 결과 목록은 지금처럼 각 검색 API가 AI 없이 주고, 이 라우트는 그 옆에 붙는 짧은 AI 답(Light · Haiku 5.5)만 만든다.
// 같은 검색어는 저장해 둔 답을 다시 쓴다(generated_results, 요청자 정보 없음). 개인정보로 보이는 검색어는 검색어 검사에서 막힌다.
// 하루 질문 횟수와 따로 세고, 새로 만들 때만 남용 검사·1시간 횟수·주간 예산을 본다 (lib/search/answer/run.ts).
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { SEARCH_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { resolveOwner } from "@/lib/inquiries/store";
import type { Owner } from "@/lib/inquiries/policy";
import { runSearchAnswer } from "@/lib/search/answer/run";
import { parseSearchText } from "@/lib/search/explore";

const MODES = ["search", "research"] as const;
const FOCUSES = ["cases", "laws"] as const;
const pick = <T extends string>(v: unknown, all: readonly T[], field: string): T => {
  if (typeof v === "string" && (all as readonly string[]).includes(v)) return v as T;
  throw new ApiError("VALIDATION_ERROR", { field });
};

export const POST = withRoute(async (req, _ctx, scope) => {
  const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  // 개인정보로 보이는 검색어는 여기서 막혀 모델로도, 저장소로도 가지 않는다 (F-007)
  const q = parseSearchText(body.q);
  const mode = pick(body.mode, MODES, "mode");
  const focus = pick(body.focus, FOCUSES, "focus");
  await assertRateLimit(SEARCH_RATE, req.headers);
  // 익명 세션이 아직 없으면 새로 만들지 않는다 — 남용 검사는 네트워크 기준으로 센다
  const owner: Owner = (await resolveOwner(scope, { create: false })) ?? {
    kind: "anon",
    anonSessionId: "",
  };
  const data = await runSearchAnswer({ q, mode, focus, owner, headers: req.headers });
  const res = ok(data, scope.requestId);
  res.headers.set("cache-control", "no-store");
  return res;
});
