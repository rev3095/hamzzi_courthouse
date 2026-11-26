// DEC-076 검색 '물어보기' AI 답 — 순수 규칙. 모델·외부 호출 없음.
import { describe, expect, test } from "vitest";
import {
  answerKey,
  applyChecks,
  arrangeLaws,
  courtCounts,
  lawTree,
  listsStale,
  mergeAnswer,
  normalizeQuery,
  readStoredAnswer,
  screenInterpretation,
  screenWritten,
  storableQuery,
  type AnswerLaw,
  type SearchAnswer,
} from "./policy";

const kr = (name: string, kind: string): AnswerLaw => ({
  name,
  kind,
  country: "kr",
  href: `/laws/${encodeURIComponent(name)}`,
  sourceUrl: "https://www.law.go.kr",
  source: "법제처",
});

const ANSWER: SearchAnswer = {
  mode: "search",
  focus: "laws",
  query: "의료기기법",
  field: "보건의료",
  intent: "의료기기를 만들고 파는 규칙을 찾고 계신 것 같아요.",
  summary: ["의료기기를 만들고 파는 일의 규칙을 정한 법이에요."],
  usage: ["의료기기를 온라인으로 팔 때"],
  conditions: [{ text: "의료기기를 업으로 만들 때 허가가 필요해요.", cite: null, confirmed: null }],
  issues: [],
  nextQueries: ["의료기기 허가"],
  laws: { domestic: [kr("의료기기법", "법률")], foreign: [] },
  cases: [],
  casesTotal: 0,
  virtualCases: [],
  searched: { ko: ["의료기기법", "의료기기"], en: [], ja: [] },
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

describe("DEC-076 저장 키·저장 가능한 검색어", () => {
  test("같은 검색어는 띄어쓰기·대소문자·전각이 달라도 같은 키", () => {
    expect(normalizeQuery("  의료기기   허가 ")).toBe("의료기기 허가");
    expect(answerKey("laws", "MDR  Rules")).toBe(answerKey("laws", "mdr rules"));
    expect(answerKey("laws", "의료기기")).not.toBe(answerKey("cases", "의료기기"));
  });

  test("개인정보로 보이는 검색어는 저장·재사용하지 않는다", () => {
    expect(storableQuery("의료기기 허가")).toBe(true);
    expect(storableQuery("010-1234-5678 손해배상")).toBe(false);
    expect(storableQuery("")).toBe(false);
    expect(storableQuery("가".repeat(101))).toBe(false);
  });

  test("맨 이름 + 낱말 꼴은 저장하지 않는다 — 흔한 법률 낱말은 그대로 저장한다", () => {
    for (const q of ["홍길동 횡령", "김철수 사기 고소", "박영희 손해배상", "홍길동"])
      expect(storableQuery(q), q).toBe(false);
    for (const q of [
      "임대차 보증금",
      "유류분 반환",
      "위자료 청구",
      "이혼 소송",
      "부당해고",
      "의료기기법",
      "공무원 징계",
      "양육비 이행",
      "변호사 선임",
      "임대차",
      "유류분",
    ])
      expect(storableQuery(q), q).toBe(true);
  });
});

describe("DEC-076 검색어 해석 거르기", () => {
  test("검색에 보낼 낱말은 꼴이 맞는 것만, 검색어와 같은 낱말은 뺀다", () => {
    const i = screenInterpretation(
      {
        offTopic: false,
        field: "보건의료",
        intent: "의료기기 허가 절차를 찾고 계신 것 같아요.",
        koTerms: ["의료기기", "의료기기법", "제6조", "홍길동 010-1234-5678"],
        lawNames: ["의료기기법", "체외진단의료기기법", "없는말"],
        en: ["medical device", "21 CFR 820", "<script>"],
        ja: ["医療機器", "abc"],
      },
      "의료기기법",
    );
    expect(i.koTerms).toEqual(["의료기기"]);
    expect(i.lawNames).toEqual(["의료기기법", "체외진단의료기기법"]);
    expect(i.en).toEqual(["medical device"]);
    expect(i.ja).toEqual(["医療機器"]);
    expect(i.field).toBe("보건의료");
  });

  test("숫자·단정이 든 해석 문장은 비운다. 법률 무관 표시는 그대로 넘긴다", () => {
    const i = screenInterpretation(
      { offTopic: true, field: "음식", intent: "반드시 3년 안에 해야 해요", koTerms: [] },
      "점심 메뉴",
    );
    expect(i.offTopic).toBe(true);
    expect(i.intent).toBe("");
  });
});

describe("DEC-076 답 문장 거르기 (절대 규칙 2·3·4)", () => {
  const raw = {
    summary: ["의료기기를 만들고 파는 규칙을 정한 법이에요.", "승소 가능성이 높아요."],
    usage: ["의료기기를 해외에서 들여올 때", "3년 안에 신고할 때"],
    conditions: [
      {
        text: "의료기기를 업으로 만들 때 허가가 필요해요.",
        lawName: "의료기기법",
        articleNo: "제6조",
      },
      { text: "대법원 판례에 따르면 처벌돼요.", lawName: "", articleNo: "" },
      { text: "광고하기 전에 심의를 받아야 해요.", lawName: "의료기기법", articleNo: "6조" },
    ],
    issues: ["허가가 필요한 품목인가요?"],
    nextQueries: ["의료기기 광고", "2023다12345"],
    virtualCases: [
      {
        title: "허가 없이 판 경우",
        situation: "판매자 A가 허가 없이 팔려고 해요.",
        point: "허가를 받았는지 봐요.",
      },
      { title: "재판 이야기", situation: "판매자 A가 재판에서 졌어요.", point: "허가를 봐요." },
    ],
  };

  test("결과 확정·확률·숫자·판례 낱말이 든 줄은 버리고, 근거는 꼴이 맞을 때만 남긴다", () => {
    const { written } = screenWritten(raw, { allowVirtual: true, mode: "search" });
    expect(written.summary).toEqual(["의료기기를 만들고 파는 규칙을 정한 법이에요."]);
    expect(written.usage).toEqual(["의료기기를 해외에서 들여올 때"]);
    expect(written.conditions.map((c) => c.cite)).toEqual([
      { lawName: "의료기기법", articleNo: "제6조" },
      null,
    ]);
    expect(written.nextQueries).toEqual(["의료기기 광고"]);
    expect(written.virtualCases.map((v) => v.title)).toEqual(["허가 없이 판 경우"]);
    // 검색 화면에는 쟁점 칸을 싣지 않는다 (리서치만)
    expect(written.issues).toEqual([]);
  });

  test("리서치는 쟁점을 싣고, 실제 판례가 있으면 가상 사례를 뺀다", () => {
    const { written } = screenWritten(raw, { allowVirtual: false, mode: "research" });
    expect(written.issues).toEqual(["허가가 필요한 품목인가요?"]);
    expect(written.virtualCases).toEqual([]);
  });
});

describe("DEC-076 근거 조문 실존 확인 (DEC-071과 같은 규칙)", () => {
  const conds = [
    { text: "가", cite: { lawName: "의료기기법", articleNo: "제6조" }, confirmed: null },
    { text: "나", cite: { lawName: "의료기기법", articleNo: "제999조" }, confirmed: null },
    { text: "다", cite: { lawName: "의료기기법", articleNo: "제7조" }, confirmed: null },
    { text: "라", cite: null, confirmed: null },
  ];
  test("없다고 확인된 조문을 댄 조건은 빼고, 확인된 것만 근거로 단다. 판정 불가는 근거 없이 남긴다", () => {
    const out = applyChecks(
      conds,
      [
        { citation: "의료기기법 제6조", exists: true },
        { citation: "의료기기법 제999조", exists: false },
        { citation: "의료기기법 제7조", exists: null },
      ],
      (l, a) => `/statutes/${l}:${a}`,
    );
    expect(out.map((c) => c.text)).toEqual(["가", "다", "라"]);
    expect(out[0].confirmed).toEqual({
      label: "의료기기법 제6조",
      href: "/statutes/의료기기법:제6조",
    });
    expect(out[1]).toMatchObject({ cite: null, confirmed: null });
  });
});

describe("DEC-076 찾은 자료 정리", () => {
  test("국내 먼저·자주 쓰는 법령·위계 순, 같은 법령은 한 번만", () => {
    const laws = arrangeLaws([
      { ...kr("Medical Devices", "Act"), country: "uk" },
      kr("의료기기법 시행령", "대통령령"),
      kr("의료기기법", "법률"),
      kr("의료기기법", "법률"),
    ]);
    expect(laws.domestic.map((l) => l.name)).toEqual(["의료기기법", "의료기기법 시행령"]);
    expect(laws.domestic[0].core).toBe(true);
    expect(laws.foreign.map((l) => l.name)).toEqual(["Medical Devices"]);
  });

  test("법령 체계: 법률 아래에 시행령·시행규칙을 묶는다", () => {
    const tree = lawTree([
      kr("의료기기법 시행규칙", "총리령"),
      kr("의료기기법", "법률"),
      kr("의료기기법 시행령", "대통령령"),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].law.name).toBe("의료기기법");
    expect(tree[0].lower.map((l) => l.name)).toEqual(["의료기기법 시행령", "의료기기법 시행규칙"]);
  });

  test("법원별 건수는 코드가 센다", () => {
    const c = (court: string) => ({
      id: court + Math.random(),
      caseNo: "",
      caseName: "",
      court,
      decidedAt: null,
      sourceUrl: "",
    });
    expect(courtCounts([c("대법원"), c("대법원"), c("서울고등법원")])).toEqual([
      { court: "대법원", count: 2 },
      { court: "서울고등법원", count: 1 },
    ]);
  });
});

describe("DEC-076 저장한 답에 덧붙이기", () => {
  test("새 문장이 있으면 바꾸고 비면 앞의 것을 둔다. 목록은 합치고, 판례가 생기면 가상 사례를 내린다", () => {
    const old = {
      ...ANSWER,
      virtualCases: [{ title: "가상", situation: "판매자 A", point: "허가" }],
    };
    const fresh: SearchAnswer = {
      ...ANSWER,
      usage: [],
      summary: ["새 요약이에요."],
      laws: { domestic: [kr("체외진단의료기기법", "법률")], foreign: [] },
      cases: [
        {
          id: "1",
          caseNo: "2020도1",
          caseName: "의료기기법위반",
          court: "대법원",
          decidedAt: null,
          sourceUrl: "",
        },
      ],
      createdAt: "2026-11-27T00:00:00.000Z",
      updatedAt: "2026-11-27T00:00:00.000Z",
    };
    const m = mergeAnswer(old, fresh);
    expect(m.summary).toEqual(["새 요약이에요."]);
    expect(m.usage).toEqual(old.usage);
    // 둘 다 자주 쓰는 법령이라 새로 찾은 것이 먼저다 (출처 순서)
    expect(m.laws.domestic.map((l) => l.name)).toEqual(["체외진단의료기기법", "의료기기법"]);
    expect(m.virtualCases).toEqual([]);
    expect(m.createdAt).toBe(old.createdAt);
    expect(m.updatedAt).toBe(fresh.updatedAt);
  });

  test("꼴이 다른 저장값은 없는 것으로 보고, 오래된 목록은 다시 찾을 때로 본다", () => {
    expect(readStoredAnswer(ANSWER)).toEqual(ANSWER);
    expect(readStoredAnswer({ summary: "x" })).toBeNull();
    expect(readStoredAnswer({ ...ANSWER, summary: [] })).toBeNull();
    expect(listsStale(ANSWER, new Date("2026-11-21T00:00:00Z"))).toBe(false);
    expect(listsStale(ANSWER, new Date("2026-11-27T00:00:00Z"))).toBe(true);
  });
});
