// 검색 '물어보기' AI 답 만들기 (DEC-076, server-only) — 저장된 답 재사용 → 남용 검사 → 횟수·예산 → Haiku 두 번 → 실존 확인 → 저장.
// 순서가 규칙이다:
//  1. 개인정보 꼴이 없는 검색어(storableQuery)면 저장된 답을 먼저 찾는다. 있으면 모델 없이 돌려주고(목록이 오래됐으면 무료 검색으로만 덧붙인다)
//  2. 없으면 무료 모드·남용 검사(assertQuestionAllowed, 절대 규칙 9)·새로 만드는 횟수(SEARCH_ANSWER_RATE)·주간 예산(tryAiQuota)을 본다
//  3. 해석(Haiku) → 법률 무관이면 경고 하나를 세고 멈춘다 → 공식 사이트 검색 → 답 쓰기(Haiku) → 성립 조건 근거 실존 확인(DEC-071)
//  4. 실제로 쓴 금액만 정산하고(settleAiQuota), 개인정보 꼴이 없는 검색어면 저장한다(앞 답이 있으면 덧붙인다)
// 하루 질문 횟수(절대 규칙 7)와는 따로 센다 — 검색을 돕는 짧은 답이라 법령 쉬운 설명(DEC-074)과 같은 방식이다.
import "server-only";
import { ApiError } from "@/lib/api/errors";
import {
  interpretSearch,
  searchModel,
  writeSearchAnswer,
  SEARCH_ANSWER_PROMPT_VERSION,
} from "@/lib/ai/search-answer";
import { aiMode } from "@/lib/ai/mode";
import { SEARCH_ANSWER_WEIGHT } from "@/lib/ai/models";
import { AI_NOTICE } from "@/lib/api/respond";
import {
  SEARCH_ANSWER_RATE,
  assertRateLimit,
  recordAbuseStrike,
  settleAiQuota,
  tryAiQuota,
} from "@/lib/auth/rate-limit";
import { assertQuestionAllowed } from "@/lib/inquiries/abuse-guard";
import type { Owner } from "@/lib/inquiries/policy";
import { statuteIdOf } from "@/lib/search/browse";
import { createLawSource } from "@/lib/search/law-source";
import { gatherFound } from "./gather";
import {
  ANSWER_REAL_CASES_ENOUGH,
  ANSWER_VIRTUAL_NOTICE,
  answerKey,
  applyChecks,
  citeText,
  listsStale,
  mergeAnswer,
  readStoredAnswer,
  storableQuery,
  type AnswerAiReason,
  type AnswerFocus,
  type AnswerMode,
  type SearchAnswer,
  type SearchAnswerView,
} from "./policy";
import { bumpGenerated, readGenerated, saveGenerated } from "./store";

const statuteHref = (lawName: string, articleNo: string) =>
  `/statutes/${encodeURIComponent(statuteIdOf(lawName, articleNo))}`;

const view = (
  answer: SearchAnswer | null,
  reused: boolean,
  reason?: AnswerAiReason,
): SearchAnswerView => ({
  answer,
  ai: reason ? { used: false, reason } : { used: true },
  reused,
  notice: AI_NOTICE,
  virtualNotice: answer && answer.virtualCases.length > 0 ? ANSWER_VIRTUAL_NOTICE : null,
});

const userIdOf = (owner: Owner) => (owner.kind === "user" ? owner.userId : null);

export async function runSearchAnswer(input: {
  q: string;
  mode: AnswerMode;
  focus: AnswerFocus;
  owner: Owner;
  headers: Headers;
  now?: Date;
}): Promise<SearchAnswerView> {
  const { q, mode, focus, owner, headers } = input;
  const now = input.now ?? new Date();
  const storable = storableQuery(q);
  const key = answerKey(focus, q);

  // 1. 저장된 답
  const stored = storable ? await readGenerated(mode, key) : null;
  const old = stored ? readStoredAnswer(stored.payload) : null;
  if (old) {
    void bumpGenerated(mode, key);
    if (!listsStale(old, now)) return view(old, true);
    // 목록(법령·판례)만 무료로 다시 찾아 덧붙인다 — 문장은 그대로, 모델은 부르지 않는다
    const found = await gatherFound({
      query: q,
      focus,
      mode,
      koTerms: old.searched.ko.filter((t) => t !== old.query),
      lawNames: old.laws.domestic.map((l) => l.name).slice(0, 3),
      en: old.searched.en,
      ja: old.searched.ja,
    }).catch(() => null);
    if (!found) return view(old, true);
    const merged = mergeAnswer(old, {
      ...old,
      laws: found.laws,
      cases: found.cases,
      casesTotal: found.casesTotal,
      updatedAt: now.toISOString(),
    });
    await saveGenerated(mode, key, merged, stored?.promptVersion ?? SEARCH_ANSWER_PROMPT_VERSION);
    return view(merged, true);
  }

  // 2. 새로 만들기 전 검사
  if (aiMode() === "free") return view(null, false, "free_mode");
  try {
    await assertQuestionAllowed(q, owner, headers);
  } catch (e) {
    if (e instanceof ApiError && (e.code === "OFF_TOPIC" || e.code === "REPETITIVE_INPUT"))
      return view(null, false, "off_topic");
    // 경고 한도에 걸린 네트워크 — 검색 결과는 그대로 보이고 AI 답만 쉰다
    if (e instanceof ApiError && e.code === "RATE_LIMITED")
      return view(null, false, "rate_limited");
    throw e;
  }
  if (!owner.admin) {
    try {
      await assertRateLimit(SEARCH_ANSWER_RATE, headers);
    } catch (e) {
      if (e instanceof ApiError && e.code === "RATE_LIMITED")
        return view(null, false, "rate_limited");
      throw e;
    }
  }
  if (!(await tryAiQuota(SEARCH_ANSWER_WEIGHT))) return view(null, false, "budget");

  // 3. Haiku 두 번 (한 비용 상한). 예외가 나도 잡아 둔 금액은 돌려준다
  const m = searchModel();
  try {
    const it = await interpretSearch(m, { query: q, focus });
    if (!it.ok) return view(null, false, it.reason);
    if (it.interp.offTopic) {
      if (!owner.admin) await recordAbuseStrike(headers, userIdOf(owner));
      return view(null, false, "off_topic");
    }
    const found = await gatherFound({ query: q, focus, mode, ...it.interp });
    const needVirtual = found.cases.length < ANSWER_REAL_CASES_ENOUGH;
    const wr = await writeSearchAnswer(m, {
      query: q,
      mode,
      field: it.interp.field,
      domestic: found.laws.domestic.map((l) => l.name),
      foreign: found.laws.foreign.map((l) => l.titleKo ?? l.name),
      cases: found.cases.map((c) => c.caseName).filter(Boolean),
      needVirtual,
    });
    if (!wr.ok) return view(null, false, wr.reason === "empty" ? "model_failed" : wr.reason);

    // 성립 조건 근거는 법제처에서 실존을 확인한 것만 근거로 붙인다 (DEC-071)
    const cites = wr.written.conditions.flatMap((c) => (c.cite ? [citeText(c.cite)] : []));
    const checks =
      cites.length > 0
        ? await createLawSource({ timeoutMs: 12_000 })
            .verifyStatutes(cites)
            .catch(() => cites.map((citation) => ({ citation, exists: null })))
        : [];
    const fresh: SearchAnswer = {
      mode,
      focus,
      query: q.normalize("NFKC").replace(/\s+/g, " ").trim(),
      field: it.interp.field,
      intent: it.interp.intent,
      ...wr.written,
      conditions: applyChecks(wr.written.conditions, checks, statuteHref),
      laws: found.laws,
      cases: found.cases,
      casesTotal: found.casesTotal,
      searched: found.searched,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    // 4. 저장 (개인정보 꼴이 없는 검색어만). 저장된 답이 꼴이 달라 못 읽었으면 새 답으로 바꾼다
    if (storable) await saveGenerated(mode, key, fresh, SEARCH_ANSWER_PROMPT_VERSION);
    return view(fresh, false);
  } finally {
    await settleAiQuota(SEARCH_ANSWER_WEIGHT, m.spentUsd());
  }
}
