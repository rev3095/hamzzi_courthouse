// @vitest-environment node
// F-016 사건 진행의 Claude 호출 (DEC-053) — 서류 읽기·쟁점 정리·요약·기업 조사. 모두 가짜 모델이다 (절대 규칙 8). 이름·회사는 가상이다.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { organizeIssues, readMatterDocs, summarizeText, MATTER_MODEL } =
  await import("@/lib/ai/matter");
const { COMPANY_MODEL, COMPANY_TOOL_LIMITS, collectSources, jsonOf, researchCompany } =
  await import("@/lib/ai/company");
const { ApiError } = await import("@/lib/api/errors");
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import {
  COMPANY_RESERVE_USD,
  MATTER_READ_COST_CAP_USD,
  MATTER_SUMMARY_COST_CAP_USD,
  WEB_SEARCH_USD,
} from "@/lib/ai/cost";
import {
  BUDGET_UNIT_USD,
  COMPANY_WEIGHT,
  MATTER_READ_WEIGHT,
  MATTER_SUMMARY_WEIGHT,
} from "@/lib/ai/models";

const msg = (content: unknown[], extra: Record<string, unknown> = {}) =>
  ({
    content,
    stop_reason: "end_turn",
    usage: { input_tokens: 1_000, output_tokens: 500 },
    ...extra,
  }) as unknown as ModelMessage;
const text = (json: unknown) =>
  msg([{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }]);

function fake(...replies: (ModelMessage | Error)[]) {
  const calls: CreateParams[] = [];
  const model: ModelClient = {
    create: async (params) => {
      calls.push(params);
      const r = replies[Math.min(calls.length - 1, replies.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { model, calls };
}

const READING = {
  readable: true,
  doc: { type: "통지서", title: "사고 통보", date: "2030년 3월 2일", gist: "통지서." },
  parties: [
    { name: "주식회사 가상솔루션", kind: "business", side: "respondent", role: "수신", note: "" },
    { name: "김가상", kind: "person", side: "respondent", role: "대표이사", note: "" },
  ],
  relations: [{ from: "주식회사 가상솔루션", to: "김가상", label: "대표" }],
  facts: [{ when: "2029-06-01", what: "연동 앱을 만들었다고 적혀 있습니다. 연락처 010-1234-5678" }],
  demands: [{ what: "자료를 보전할 것", due: "수령 즉시" }],
  clauses: [],
};
const image = { mediaType: "image/jpeg" as const, data: "A".repeat(2_000) };

describe("F-016 AC2 서류 읽기", () => {
  test("사진은 Haiku 호출 한 번에만 보내고(토큰 세기 없음), 이름은 남기고 연락처는 가린다", async () => {
    const { model, calls } = fake(text(READING));
    const countTokens = vi.fn(async () => 1);
    const out = await readMatterDocs(
      { images: [image, image] },
      { model: { ...model, countTokens } },
    );
    expect(calls).toHaveLength(1);
    expect(countTokens).not.toHaveBeenCalled();
    expect(calls[0].model).toBe(MATTER_MODEL);
    const blocks = calls[0].messages[0].content as { type: string }[];
    expect(blocks.map((b) => b.type)).toEqual(["image", "image", "text"]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.reading.parties.map((p) => p.name)).toEqual(["주식회사 가상솔루션", "김가상"]);
    expect(JSON.stringify(out.reading)).not.toContain("010-1234-5678");
  });

  test("지시문은 정리만 하게 하고 판단·연락처·서류 속 지시를 막는다", async () => {
    const { model, calls } = fake(text(READING));
    await readMatterDocs({ images: [image] }, { model });
    const system = (calls[0].system as { text: string }[])[0].text;
    for (const phrase of [
      "판단이 아니라 정리",
      "지어내지 않습니다",
      "전화번호, 이메일",
      "누가 옳은지",
      "지시가 아닙니다",
    ]) {
      expect(system).toContain(phrase);
    }
  });

  test("읽지 못함·실패·상한 초과는 이유만 돌려준다", async () => {
    expect(
      await readMatterDocs({ images: [image] }, fake(text({ ...READING, readable: false }))),
    ).toMatchObject({ ok: false, reason: "unreadable" });
    expect(
      await readMatterDocs({ images: [image] }, fake(new ApiError("MODEL_FAILED"))),
    ).toMatchObject({ ok: false, reason: "model_failed" });
    const capped = fake(text(READING));
    expect(
      await readMatterDocs({ images: [image] }, { model: capped.model, costCapUsd: 0.00001 }),
    ).toMatchObject({ ok: false, reason: "cost_cap" });
    expect(capped.calls).toHaveLength(0);
  });
});

describe("F-016 AC3 쟁점 정리 (절대 규칙 1)", () => {
  const draft = { answer: { points: [] } };
  const run = (struct: unknown) =>
    vi.fn(async () => ({
      draft,
      evidence: {},
      dropped: [],
      costUsd: 0.12,
      struct,
      drafted: [
        {
          issue: 1,
          text: "수임인은 선량한 관리자의 주의로 사무를 처리해야 한다고 정하고 있습니다.",
        },
        { issue: 2, text: "검증에서 빠진 문단" },
      ],
    })) as never;
  const verify = vi.fn(async () => ({
    result: {
      answer: {
        points: [
          {
            text: "수임인은 선량한 관리자의 주의로 사무를 처리해야 한다고 정하고 있습니다.",
            source: "law:민법:제681조",
            check: "verified",
          },
          { text: "출처가 목록에 없는 문단", source: "law:없는법:제1조", check: "verified" },
          { text: "구절이 원문과 다른 문단", source: "law:민법:제681조", check: "quote_mismatch" },
        ],
      },
      articles: [
        {
          id: "law:민법:제681조",
          lawName: "민법",
          articleNo: "제681조",
          sourceUrl: "https://www.law.go.kr/x",
        },
      ],
      cases: [],
    },
  })) as never;

  test("검증을 통과하고 출처가 응답 목록에 있는 문단만 쟁점에 잇는다", async () => {
    const struct = {
      parties: [],
      events: [],
      issues: [
        { title: "삭제 의무는 누구에게 있는지", lawName: null, lawKeywords: [], caseQuery: null },
        { title: "손해 범위", lawName: null, lawKeywords: [], caseQuery: null },
      ],
      unknowns: ["삭제 지시가 있었는지"],
      lawQuery: null,
    };
    const out = await organizeIssues("가린 글", { run: run(struct), verify });
    expect(out.issues).toEqual([
      {
        title: "삭제 의무는 누구에게 있는지",
        points: [
          {
            text: "수임인은 선량한 관리자의 주의로 사무를 처리해야 한다고 정하고 있습니다.",
            label: "민법 제681조",
            url: "https://www.law.go.kr/x",
          },
        ],
      },
      { title: "손해 범위", points: [] },
    ]);
    expect(out.unknowns).toEqual(["삭제 지시가 있었는지"]);
    expect(out.costUsd).toBe(0.12);
    expect(JSON.stringify(out)).not.toContain("없는법");
    expect(JSON.stringify(out)).not.toContain("구절이 원문과 다른");
  });

  test("구조화가 안 됐으면 확인된 근거만 한 묶음으로", async () => {
    const out = await organizeIssues("가린 글", { run: run(null), verify });
    expect(out.issues).toHaveLength(1);
    expect(out.issues[0].points).toHaveLength(1);
  });
});

describe("F-016 AC5 요약", () => {
  test("가린 글을 Haiku로 줄이고 단정 표현 줄은 뺀다", async () => {
    const { model, calls } = fake(
      text({ lines: ["회사는 소재를 만든다고 적혀 있습니다.", "반드시 성공합니다.", ""] }),
    );
    const out = await summarizeText("[이름1]이 쓴 글", { model });
    expect(calls[0].model).toBe(MATTER_MODEL);
    expect(calls[0].messages[0].content).toContain("[이름1]");
    expect(out).toMatchObject({ ok: true, lines: ["회사는 소재를 만든다고 적혀 있습니다."] });
    expect(await summarizeText("글", fake(text({ lines: [] })))).toMatchObject({
      ok: false,
      reason: "empty",
    });
  });
});

describe("F-016 AC4 기업 조사", () => {
  const REPORT = {
    overview: "커피 원두를 볶아 파는 회사라고 홈페이지에 적혀 있습니다. 전망이 밝습니다.",
    products: ["원두 정기 배송"],
    business: "자료에서 확인하지 못했습니다",
    items: ["직화 로스팅"],
    basics: ["2011년 설립"],
    unknowns: ["매출 규모"],
  };
  const toolBlocks = [
    { type: "server_tool_use", id: "s1", name: "web_fetch", input: {} },
    {
      type: "web_fetch_tool_result",
      tool_use_id: "s1",
      content: { type: "web_fetch_result", url: "https://example.co.kr/" },
    },
    {
      type: "web_fetch_tool_result",
      tool_use_id: "s2",
      content: { type: "web_fetch_tool_result_error", error_code: "url_not_accessible" },
    },
    {
      type: "web_search_tool_result",
      tool_use_id: "s3",
      content: [
        { type: "web_search_result", title: "가상랩 소개 기사", url: "https://news.example.com/a" },
        { type: "web_search_result", title: "같은 주소", url: "https://example.co.kr" },
      ],
    },
  ];

  test("웹 검색·가져오기 도구를 횟수 한도와 함께 쓰고, 출처는 도구가 실제로 가져온 주소만 싣는다", async () => {
    const reply = msg(
      [...toolBlocks, { type: "text", text: `정리했습니다.\n${JSON.stringify(REPORT)}` }],
      {
        usage: {
          input_tokens: 20_000,
          output_tokens: 800,
          server_tool_use: { web_search_requests: 2, web_fetch_requests: 2 },
        },
      },
    );
    const { model, calls } = fake(reply);
    const out = await researchCompany(
      {
        name: "가상랩",
        urls: ["https://example.co.kr/", "https://blog.example.com/post/1"],
        pastedMasked: "[이름1]이 쓴 소개 글",
        snippets: ["가상랩 탐방 — 요약문"],
      },
      { model },
    );
    const tools = calls[0].tools as {
      type: string;
      max_uses: number;
      max_content_tokens?: number;
    }[];
    expect(calls[0].model).toBe(COMPANY_MODEL);
    expect(tools.map((t) => [t.type, t.max_uses])).toEqual([
      ["web_search_20260209", COMPANY_TOOL_LIMITS.searches],
      ["web_fetch_20260209", COMPANY_TOOL_LIMITS.fetches],
    ]);
    expect(tools[1].max_content_tokens).toBe(COMPANY_TOOL_LIMITS.fetchTokens);
    const user = calls[0].messages[0].content as string;
    expect(user).toContain("회사 이름: 가상랩");
    expect(user).toContain("https://blog.example.com/post/1");
    expect(user).toContain("[이름1]이 쓴 소개 글");

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 평가 문장은 빠진다
    expect(out.report.overview).toBe("커피 원두를 볶아 파는 회사라고 홈페이지에 적혀 있습니다.");
    // 읽은 페이지와 검색에 나온 페이지를 나눠 싣는다 (같은 주소는 한 번만)
    expect(out.sources).toEqual([{ title: "example.co.kr", url: "https://example.co.kr/" }]);
    expect(out.found).toEqual([{ title: "가상랩 소개 기사", url: "https://news.example.com/a" }]);
    // 읽지 못한 링크는 따로 알린다 (본문을 붙여 넣게)
    expect(out.unread).toEqual(["https://blog.example.com/post/1"]);
    // 비용 = 토큰 + 웹 검색 건당 요금
    expect(out.costUsd).toBeCloseTo((20_000 * 4 + 800 * 20) / 1_000_000 + 2 * WEB_SEARCH_USD, 8);
  });

  test("도구 작업이 길어 멈춘 응답은 그대로 돌려보내 이어 가고, 정해진 횟수만 잇는다", async () => {
    const paused = msg([{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }], {
      stop_reason: "pause_turn",
    });
    const { model, calls } = fake(paused, text(REPORT));
    const out = await researchCompany(
      { name: "가상랩", urls: [], pastedMasked: "", snippets: [] },
      { model },
    );
    expect(out.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].messages).toHaveLength(2);
    expect(calls[1].messages[1].role).toBe("assistant");

    const stuck = fake(paused);
    const never = await researchCompany(
      { name: "가상랩", urls: [], pastedMasked: "", snippets: [] },
      { model: stuck.model },
    );
    expect(stuck.calls).toHaveLength(2);
    expect(never).toMatchObject({ ok: false, reason: "model_failed" });
  });

  test("읽히지 않는 것으로 알려진 링크는 모델에 주지 않고 읽지 못함으로 돌려준다", async () => {
    const { model, calls } = fake(text(REPORT));
    const out = await researchCompany(
      {
        name: "가상랩",
        urls: [],
        pastedMasked: "",
        snippets: [],
        skipped: ["https://blog.naver.com/x/1"],
      },
      { model },
    );
    expect(calls[0].messages[0].content).not.toContain("blog.naver.com");
    expect(out.unread).toEqual(["https://blog.naver.com/x/1"]);
  });

  test("JSON이 아니거나 내용이 없으면 이유만 돌려준다. 도우미는 앞뒤 글이 붙은 JSON도 읽는다", async () => {
    expect(
      await researchCompany(
        { name: "가상랩", urls: ["https://example.com/"], pastedMasked: "", snippets: [] },
        fake(text("찾지 못했습니다")),
      ),
    ).toMatchObject({
      ok: false,
      reason: "model_failed",
      unread: ["https://example.com/"],
    });
    expect(jsonOf('앞글 {"a": 1} 뒷글')).toEqual({ a: 1 });
    expect(collectSources([]).fetched).toEqual([]);
  });
});

describe("F-016 비용 상한과 예산 단위 (절대 규칙 3)", () => {
  test("예산 차감 단위는 상한 ÷ 단위를 올림한 값이다", () => {
    const units = (usd: number) => Math.ceil(usd / BUDGET_UNIT_USD - 1e-9);
    expect(MATTER_READ_WEIGHT).toBe(units(MATTER_READ_COST_CAP_USD));
    expect(MATTER_SUMMARY_WEIGHT).toBe(units(MATTER_SUMMARY_COST_CAP_USD));
    expect(COMPANY_WEIGHT).toBe(units(COMPANY_RESERVE_USD));
  });
});

describe("F-016 서류 읽기 뒤 조문·사건번호 재조회 (절대 규칙 1)", () => {
  const cited = {
    ...READING,
    facts: [{ when: "", what: "발신인은 민법 제681조와 2020다12345 판결을 들었습니다." }],
    clauses: [
      { ref: "가상법 제999조", gist: "없는 조문." },
      { ref: "베트남 민법 제681조", gist: "다른 나라 법." },
    ],
  };
  // 법제처 조회는 법령 이름을 넓게 찾아 비슷한 법령을 돌려줄 수 있다 — "베트남 민법"에도 "민법"을 돌려주는 가짜
  const article = (lawName: string, articleNo: string) =>
    ({ lawName: /민법$/.test(lawName) ? "민법" : lawName, articleNo }) as never;
  test("법령 이름이 글자 그대로 같은 조문이 법제처에 있을 때만 남기고 개수를 알린다", async () => {
    const lawSource = {
      getArticle: vi.fn(async (lawName: string, articleNo: string) =>
        lawName === "가상법" ? null : article(lawName, articleNo),
      ),
      verifyCases: vi.fn(async (c: string[]) => c.map((citation) => ({ citation, exists: null }))),
    };
    const out = await readMatterDocs({ images: [image] }, { ...fake(text(cited)), lawSource });
    expect(lawSource.getArticle).toHaveBeenCalledWith("민법", "제681조");
    expect(lawSource.getArticle).toHaveBeenCalledWith("가상법", "제999조");
    expect(lawSource.verifyCases).toHaveBeenCalledWith(["2020다12345"]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 베트남 민법은 조회 결과 이름("민법")이 달라 확인되지 않는다
    expect(out.citations).toEqual({ checked: 4, removed: 3, failed: false });
    expect(out.reading.facts[0].what).toContain("민법 제681조");
    expect(out.reading.facts[0].what).not.toContain("2020다12345");
    expect(out.reading.clauses).toEqual([]);
  });

  test("재조회가 실패해도 읽은 결과는 돌려주되 조문·사건번호는 모두 가린다", async () => {
    const lawSource = {
      getArticle: vi.fn(async () => {
        throw new ApiError("SEARCH_UPSTREAM_FAILED");
      }),
      verifyCases: vi.fn(async () => []),
    };
    const out = await readMatterDocs({ images: [image] }, { ...fake(text(cited)), lawSource });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.citations.failed).toBe(true);
    expect(JSON.stringify(out.reading)).not.toMatch(/제681조|제999조|2020다12345/);
  });

  test("조문·사건번호가 없으면 재조회하지 않는다", async () => {
    const lawSource = { getArticle: vi.fn(), verifyCases: vi.fn() };
    const out = await readMatterDocs({ images: [image] }, { ...fake(text(READING)), lawSource });
    expect(out.ok && out.citations).toEqual({ checked: 0, removed: 0, failed: false });
    expect(lawSource.getArticle).not.toHaveBeenCalled();
  });
});

describe("F-016 기업 조사: 개인 거절·비용 장부", () => {
  test("지시문은 사람이면 조사하지 않고 정해진 값만 쓰게 하고, 그 값이면 person으로 돌려준다", async () => {
    const { model, calls } = fake(text({ refused: "person" }));
    const out = await researchCompany(
      { name: "가상 머스크", urls: [], pastedMasked: "", snippets: [] },
      { model },
    );
    const system = (calls[0].system as { text: string }[])[0].text;
    expect(system).toContain('{"refused": "person"}');
    expect(system).toContain("사람은 조사하지 않습니다");
    expect(system).toContain("대표자:");
    expect(out).toMatchObject({ ok: false, reason: "person" });
  });

  test("웹 검색 요금은 비용 장부에 들어가 이어 가기 호출의 금액 계획에도 잡힌다", async () => {
    const paused = msg([{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }], {
      stop_reason: "pause_turn",
      usage: {
        input_tokens: 1_000,
        output_tokens: 100,
        server_tool_use: { web_search_requests: 4 },
      },
    });
    // 첫 호출 뒤 남은 금액이 웹 검색 요금만큼 줄어 이어 가기가 금액 계획에 걸린다
    const { model, calls } = fake(paused, text({ overview: "x", products: [] }));
    const out = await researchCompany(
      { name: "가상랩", urls: [], pastedMasked: "", snippets: [] },
      { model, costCapUsd: 0.045 },
    );
    expect(calls).toHaveLength(1);
    // 멈춘 응답에는 정리 글이 없어 금액 계획에 걸린 것으로 알린다 (첫 호출 비용은 그대로 남는다)
    expect(out).toMatchObject({ ok: false, reason: "cost_cap" });
    expect(out.costUsd).toBeGreaterThanOrEqual(4 * WEB_SEARCH_USD);
  });

  test("이어 가기가 금액 계획에 걸려도 앞 응답에 정리 글이 있으면 그것을 쓴다", async () => {
    const paused = msg(
      [
        {
          type: "text",
          text: JSON.stringify({
            overview: "원두를 볶아 판다고 적혀 있습니다.",
            products: [],
            business: "",
            items: [],
            basics: [],
            unknowns: [],
          }),
        },
      ],
      {
        stop_reason: "pause_turn",
        usage: {
          input_tokens: 1_000,
          output_tokens: 100,
          server_tool_use: { web_search_requests: 4 },
        },
      },
    );
    const { model, calls } = fake(paused, text({}));
    const out = await researchCompany(
      { name: "가상랩", urls: [], pastedMasked: "", snippets: [] },
      { model, costCapUsd: 0.045 },
    );
    expect(calls).toHaveLength(1);
    expect(out.ok).toBe(true);
  });
});

describe("F-016 기업 조사: 응답 없이 끝난 호출의 비용", () => {
  test("시간 초과·모델 오류로 끝나면 실제 금액을 모르므로 잡아 둔 금액 전액으로 알린다", async () => {
    const { model } = fake(new ApiError("TIMEOUT"));
    const out = await researchCompany(
      { name: "가상랩", urls: [], pastedMasked: "", snippets: [] },
      { model },
    );
    expect(out).toMatchObject({ ok: false, reason: "model_failed" });
    expect(out.costUsd).toBe(COMPANY_RESERVE_USD);
  });
});
