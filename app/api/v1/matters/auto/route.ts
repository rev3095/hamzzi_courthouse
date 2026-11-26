// POST /api/v1/matters/auto — 사건 진행: 자동 정리 (DEC-070, API.md). 로그인 사용자만. 본문 { matterId }.
// 저장된 사건 자료로 제목(이름을 비워 만든 사건만)·법 분야·한 줄 요약을 Haiku 1회로 만든다 — 화면을 위한 자동 생성은
// 언제나 Haiku (사용자 절대 규칙 2026-11-27). 자료가 그대로면(지문 autoSig가 같으면) 모델을 부르지 않는다.
// 모델에 보내는 글은 이름·연락처를 가린 문장뿐이고(maskForModel), 민감정보로 보이면 동의 화면이 없는 자동 경로라 부르지 않는다.
// 하루 횟수(MATTER_AI_RATE)는 세지 않는다 — 자료가 바뀔 때만 부르고, 전체 예산·금액 상한은 그대로 받는다.
import { autoNameMatter } from "@/lib/ai/matter";
import { MATTER_SUMMARY_WEIGHT } from "@/lib/ai/models";
import { AI_NOTICE, ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { WRITE_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { runMatterAi } from "@/lib/matters/ai-gate";
import {
  autoSig,
  composeAutoText,
  hasAutoContent,
  maskForModel,
  maskNamesOf,
  parseMatterId,
  type MatterAuto,
} from "@/lib/matters/policy";
import { getMatter, requireMatterUser, saveMatterAuto } from "@/lib/matters/store";

export const maxDuration = 30;

type Reason =
  "empty" | "unchanged" | "sensitive" | "free_mode" | "budget" | "cost_cap" | "model_failed";

export const POST = withRoute(async (req, _ctx, scope) => {
  const user = await requireMatterUser(scope);
  await assertRateLimit(WRITE_RATE, req.headers);
  const id = parseMatterId(await readJson<Record<string, unknown>>(req));
  const m = await getMatter(user.userId, id);
  const reply = (
    auto: MatterAuto | null,
    title: string,
    ai: { used: true } | { used: false; reason: Reason },
  ) => {
    const res = ok({ auto, title, ai, notice: auto ? AI_NOTICE : null }, scope.requestId);
    res.headers.set("cache-control", "no-store");
    return res;
  };
  const current = m.data.auto ?? null;
  if (!hasAutoContent(m.data)) return reply(current, m.title, { used: false, reason: "empty" });
  const sig = autoSig(m.data);
  if (current?.sig === sig) return reply(current, m.title, { used: false, reason: "unchanged" });

  const masked = maskForModel(composeAutoText(m.data), maskNamesOf(m.data));
  if (masked.sensitive.length > 0) {
    return reply(current, m.title, { used: false, reason: "sensitive" });
  }
  const r = await runMatterAi(user, MATTER_SUMMARY_WEIGHT, () => autoNameMatter(masked.text), {
    rateChecked: true,
  });
  if (r.skipped) return reply(current, m.title, r.skipped);
  if (!r.out.ok) return reply(current, m.title, { used: false, reason: r.out.reason });

  const auto: MatterAuto = {
    field: r.out.field,
    gist: r.out.gist,
    sig,
    at: new Date().toISOString(),
  };
  const title = m.data.titleAuto && r.out.title ? r.out.title : m.title;
  await saveMatterAuto(user.userId, id, {
    title,
    data: { ...m.data, auto },
    updatedAt: m.updatedAt,
  });
  return reply(auto, title, { used: true });
});
