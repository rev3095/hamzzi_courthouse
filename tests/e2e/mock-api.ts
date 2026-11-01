// E2E용 가짜 API (P9). 브라우저 요청을 가로채 API.md 4.1 형식으로 답한다 — 서버·DB·법제처·Claude를 부르지 않는다.
import type { Page, Route } from "@playwright/test";
import { AI_NOTICE } from "../../lib/api/respond";
import type { DemoAnalysisResult } from "../../lib/citations/policy";
import { demoExamples, findExample, replayResult, SEARCH_ONLY_NOTE } from "../../lib/demo/policy";

export const INQ = "11111111-1111-4111-8111-111111111111";

export function replayOf(question = demoExamples()[0].question): DemoAnalysisResult {
  return replayResult(findExample(question)!);
}

export const searchOnly: DemoAnalysisResult = {
  mode: "search_only",
  outcome: "grounded",
  aiNotice: AI_NOTICE,
  intent: { area: "", goal: "", laws: ["주택임대차보호법"], lawKeywords: ["질문 문장"] },
  answer: { points: [] },
  articles: [
    {
      id: "law:주택임대차보호법:제3조",
      lawName: "주택임대차보호법",
      articleNo: "제3조",
      title: "대항력 등",
      effectiveFrom: "2026-01-02",
      sourceUrl: "https://www.law.go.kr",
      used: false,
    },
  ],
  cases: [],
  searches: [{ keyword: "대항력 등", total: 3 }],
  trace: [],
  recheck: { ok: true, items: [], removed: 0 },
  searchScopeNote: SEARCH_ONLY_NOTE,
};

export const noResult: DemoAnalysisResult = {
  ...searchOnly,
  outcome: "no_result_in_scope",
  articles: [],
  searches: [{ keyword: "고양이", total: 0 }],
};

type Analyze =
  { result: DemoAnalysisResult } | { error: { code: string; message: string; requestId: string } };

export type MockOptions = {
  quota?: { used: number; loginRequired?: boolean };
  create?: (body: Record<string, unknown>) => { status: number; body: unknown };
  analyze?: Analyze;
};

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

export async function mockApi(page: Page, opts: MockOptions = {}) {
  const calls = {
    create: [] as Record<string, unknown>[],
    confirm: 0,
    analyze: 0,
    feedback: [] as Record<string, unknown>[],
  };
  let analyzed = false;
  const used = opts.quota?.used ?? 0;

  await page.route("**/api/v1/me/quota", (route) =>
    json(route, 200, {
      data: {
        anonymous: true,
        used: analyzed ? used + 1 : used,
        limit: 3,
        remaining: 3 - (analyzed ? used + 1 : used),
        loginRequired: opts.quota?.loginRequired ?? false,
      },
    }),
  );

  await page.route("**/api/v1/inquiries", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.create.push(body);
    const out = opts.create?.(body) ?? {
      status: 201,
      body: {
        data: {
          id: INQ,
          status: "draft",
          piiFindings: [],
          maskedText: body.text,
          piiConfirmationRequired: false,
        },
      },
    };
    return json(route, out.status, out.body);
  });

  await page.route("**/api/v1/inquiries/*/pii-confirmation", (route) => {
    calls.confirm += 1;
    return json(route, 200, { data: { id: INQ, status: "pii_confirmed" } });
  });

  await page.route("**/api/v1/inquiries/*/result", (route) => {
    if (analyzed && opts.analyze && "result" in opts.analyze) {
      return json(route, 200, {
        data: { status: "analyzed", resultId: "r1", result: opts.analyze.result },
      });
    }
    return json(route, 404, {
      error: { code: "NOT_FOUND", message: "찾을 수 없습니다.", requestId: "req-1" },
    });
  });

  await page.route("**/api/v1/inquiries/*/analyze", (route) => {
    calls.analyze += 1;
    const a = opts.analyze ?? { result: replayOf() };
    const step = `event: step\ndata: ${JSON.stringify({ stage: "answer", message: "미리 분석해 둔 예시 답변을 불러오고 있어요" })}\n\n`;
    let last: string;
    if ("result" in a) {
      analyzed = true;
      last = `event: result\ndata: ${JSON.stringify({ status: "analyzed", resultId: "r1", result: a.result })}\n\n`;
    } else {
      last = `event: error\ndata: ${JSON.stringify(a.error)}\n\n`;
    }
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: step + last,
    });
  });

  await page.route("**/api/v1/results/*/feedback", (route) => {
    calls.feedback.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 204 });
  });

  return calls;
}
