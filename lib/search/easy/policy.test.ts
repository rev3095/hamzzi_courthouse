// 법령 쉬운 설명 규칙 (DEC-074): 모델 입력 고르기 · 출력 거르기(절대 규칙 1·2·3) · AI 없는 정리. 모델 호출 없음.
import { describe, expect, test } from "vitest";
import {
  EASY_INPUT_CHARS,
  EASY_LIMITS,
  digestArticles,
  easyUsable,
  fallbackEasy,
  firstSentence,
  screenEasy,
  type EasyArticle,
} from "./policy";

const ARTICLES: EasyArticle[] = [
  {
    articleNo: "제1조",
    title: "목적",
    text: "제1조(목적) 이 법은 의료기기의 제조ㆍ수입 및 판매 등에 관한 사항을 규정함으로써 의료기기의 효율적인 관리를 도모하고 국민보건 향상에 이바지함을 목적으로 한다.",
  },
  {
    articleNo: "제2조",
    title: "정의",
    text: "제2조(정의) ① 이 법에서 “의료기기”란 사람이나 동물에게 단독 또는 조합하여 사용되는 기구ㆍ기계ㆍ장치ㆍ재료를 말한다.",
  },
  {
    articleNo: "제6조",
    title: "제조업의 허가 등",
    text: "제6조(제조업의 허가 등) ① 의료기기의 제조를 업으로 하려는 자는 식품의약품안전처장의 제조업허가를 받아야 한다.",
  },
  {
    articleNo: "제17조",
    title: "판매업 등의 신고",
    text: "제17조(판매업 등의 신고) ① 의료기기의 판매를 업으로 하려는 자는 영업소 소재지의 시장ㆍ군수 또는 구청장에게 판매업신고를 하여야 한다.",
  },
  {
    articleNo: "제24조",
    title: "기재 및 광고의 금지 등",
    text: "제24조(기재 및 광고의 금지 등) ① 의료기기의 용기, 외장, 포장 또는 첨부문서에 거짓이나 오해할 염려가 있는 사항을 표시하거나 적어서는 아니 된다.",
  },
  {
    articleNo: "제51조",
    title: "벌칙",
    text: "제51조(벌칙) ① 제6조제1항을 위반한 자는 5년 이하의 징역 또는 5천만원 이하의 벌금에 처한다.",
  },
];

const GOOD = {
  summary: [
    "의료기기를 만들고 들여오고 파는 일의 규칙을 정한 법이에요.",
    "국민 건강을 지키려고 의료기기를 관리하도록 정하고 있어요.",
  ],
  who: ["의료기기를 만들거나 파는 사업자"],
  keyPoints: [
    {
      title: "만들려면 허가가 필요해요",
      body: "의료기기를 만드는 일을 하려면 식품의약품안전처장의 허가를 받도록 정하고 있어요.",
      articleNo: "제6조",
    },
    {
      title: "팔려면 신고해요",
      body: "의료기기를 파는 일을 하려면 영업소가 있는 곳의 시장·군수·구청장에게 신고하도록 정하고 있어요.",
      articleNo: "17조",
    },
  ],
  issues: [{ question: "허가 없이 만들면 어떻게 되나요?", articleNo: "제51조" }],
  virtualCases: [
    {
      title: "허가 없이 만든 경우",
      situation: "제조업자 A가 허가를 받지 않고 의료기기를 만들어 팔려고 해요.",
      lawSays: "이 법은 만드는 일을 하려면 먼저 허가를 받도록 정하고 있어요.",
      articleNo: "제6조",
    },
  ],
};

describe("DEC-074 모델 입력 고르기", () => {
  test("목차에는 모든 조문 번호·제목이 들어가고, 본문은 목적·정의 → 주요 제목 순으로 넣는다", () => {
    const d = digestArticles(ARTICLES);
    for (const a of ARTICLES) expect(d.text).toContain(`${a.articleNo} ${a.title}`);
    expect(d.included).toEqual(["제1조", "제2조", "제6조", "제17조", "제24조", "제51조"]);
    expect(d.text.length).toBeLessThanOrEqual(EASY_INPUT_CHARS);
  });

  test("조문이 많아도 글자 수 상한을 넘지 않고, 긴 조문은 잘라 넣는다", () => {
    const many: EasyArticle[] = Array.from({ length: 400 }, (_, i) => ({
      articleNo: `제${i + 1}조`,
      title: i === 250 ? "과태료" : `가상 제목 ${i + 1}`,
      text: "가".repeat(3_000),
    }));
    const d = digestArticles(many);
    expect(d.text.length).toBeLessThanOrEqual(EASY_INPUT_CHARS);
    // 주요 제목(과태료)은 조문 순서보다 먼저 본문에 들어간다
    expect(d.included.slice(0, 3)).toEqual(["제1조", "제2조", "제251조"]);
    expect(d.included.length).toBeGreaterThan(5);
    const small = digestArticles(many, 3_000);
    expect(small.text.length).toBeLessThanOrEqual(3_000);
  });

  test("조문이 아주 많으면 목차를 줄인다 (입력의 절반까지)", () => {
    const huge: EasyArticle[] = Array.from({ length: 1_200 }, (_, i) => ({
      articleNo: `제${i + 1}조`,
      title: "가상 제목입니다",
      text: "본문",
    }));
    const d = digestArticles(huge);
    expect(d.text).toContain("(이하 조문 제목 생략)");
    expect(d.text.length).toBeLessThanOrEqual(EASY_INPUT_CHARS);
    expect(d.included[0]).toBe("제1조");
  });
});

describe("DEC-074 쉬운 설명 거르기 (절대 규칙 1·2·3)", () => {
  test("규칙에 맞는 설명은 그대로 남고, 근거 조문 번호는 정식 꼴로 맞춘다", () => {
    const { easy, dropped } = screenEasy(GOOD, ARTICLES);
    expect(dropped).toEqual([]);
    expect(easy.summary).toHaveLength(2);
    expect(easy.keyPoints.map((k) => k.articleNo)).toEqual(["제6조", "제17조"]);
    expect(easy.issues[0].articleNo).toBe("제51조");
    expect(easy.virtualCases).toHaveLength(1);
    expect(easyUsable(easy)).toBe(true);
  });

  test("이 법에 없는 조문 번호: 근거 칸은 비우고, 본문에 적혀 있으면 그 항목을 뺀다", () => {
    const { easy, dropped } = screenEasy(
      {
        ...GOOD,
        keyPoints: [
          { ...GOOD.keyPoints[0], articleNo: "제99조" },
          {
            title: "가짜 조문",
            body: "제99조에 따라 등록하도록 정하고 있어요.",
            articleNo: "제6조",
          },
          { title: "있는 조문", body: "제6조에서 허가를 받도록 정하고 있어요.", articleNo: null },
        ],
      },
      ARTICLES,
    );
    // 근거 조문을 댈 수 없는 핵심 내용은 싣지 않는다
    expect(easy.keyPoints).toEqual([]);
    expect(dropped).toEqual(["no_article", "unknown_article", "no_article"]);
  });

  test("해요체 단정·한글 숫자·다른 법령 조문·판례 낱말은 설명에서 빠진다", () => {
    const bad = [
      "허가 없이 팔면 처벌받아요.",
      "이렇게 하면 꼭 이겨요.",
      "벌금은 오백만 원이에요.",
      "법원은 이런 경우를 엄격하게 봐요.",
      "판례는 이렇게 보고 있어요.",
      "시행규칙 제6조에서 자세히 정하고 있어요.",
      "약사법 제6조도 함께 봐야 해요.",
    ];
    const { easy, dropped } = screenEasy({ ...GOOD, summary: bad }, ARTICLES, {
      lawName: "의료기기법",
    });
    expect(easy.summary).toEqual([]);
    expect(dropped).toEqual([
      "assertive",
      "assertive",
      "number_not_in_source",
      "case_like",
      "case_like",
      "other_law_article",
      "other_law_article",
    ]);
    // 가능성을 여는 말투와 이 법 이름을 붙인 조문은 남는다
    const ok = screenEasy(
      { ...GOOD, summary: ["허가 없이 팔면 처벌받을 수 있어요.", "의료기기법 제6조에서 정해요."] },
      ARTICLES,
      { lawName: "의료기기법" },
    );
    expect(ok.easy.summary).toHaveLength(2);
  });

  test("실제 사건처럼 읽히는 말·조사 낀 단정·유불리 표현도 빠지고, 흔한 말은 오탐하지 않는다", () => {
    const bad = [
      "실제로 허가 없이 팔다가 적발된 사례가 있어요.",
      "대법은 이런 경우 허가가 필요하다고 봤어요.",
      "허가 없이 팔면 처벌을 받아요.",
      "처벌받게 될 거예요.",
      "승소 가능성이 높아요.",
      "이렇게 하면 유리할 수 있어요.",
      "처벌될 가능성이 커요.",
      "실제로 적발되는 일이 많아요.",
      "하루 안에 신고하도록 정하고 있어요.",
    ];
    expect(screenEasy({ ...GOOD, summary: bad }, ARTICLES).easy.summary).toEqual([]);
    const fine = [
      "그런 일이 일어나면 신고하도록 정하고 있어요.",
      "제조업자가 책임을 져요.",
      "준수사항을 정하고 있어요.",
    ];
    expect(screenEasy({ ...GOOD, summary: fine }, ARTICLES).easy.summary).toEqual(fine);
  });

  test("가상 사례는 숫자·날짜·재판 이야기·근거 없는 것을 모두 뺀다", () => {
    const v = (situation: string, articleNo: string | null = "제6조") => ({
      title: "가상 상황",
      situation,
      lawSays: "제6조에서 허가를 받도록 정하고 있어요.",
      articleNo,
    });
    const { easy, dropped } = screenEasy(
      {
        ...GOOD,
        virtualCases: [
          v("판매업자 A가 2023. 5. 1. 제품을 팔았어요."),
          v("판매업자 A가 세 번 광고를 냈어요."),
          v("판매업자 A는 재판에서 졌어요."),
          v("판매업자 A가 작년 봄에 제품을 팔았어요."),
          v("판매업자 A가 과태료를 물었어요."),
          v("판매업자 A가 경찰 조사를 받았어요."),
          v("판매업자 A가 행정처분을 받았어요."),
          v("판매업자 A가 허가 없이 제품을 팔려고 해요.", null),
          v("판매업자 A가 허가 없이 제품을 팔려고 해요."),
        ],
      },
      ARTICLES,
    );
    expect(dropped).toEqual([
      "number_in_virtual",
      "number_in_virtual",
      "case_like",
      "number_in_virtual",
      "case_like",
      "case_like",
      "case_like",
      "no_article",
    ]);
    // 흔한 말은 가상 사례에서 오탐하지 않는다
    const fine = screenEasy(
      {
        ...GOOD,
        virtualCases: [v("판매업자 A가 준수사항을 모르고 포장이 찢어졌어요.")],
      },
      ARTICLES,
    );
    expect(fine.easy.virtualCases).toHaveLength(1);
    expect(easy.virtualCases).toHaveLength(1);
  });

  test("사건번호·법원 이름·판례 언급이 있으면 뺀다", () => {
    const { easy, dropped } = screenEasy(
      {
        ...GOOD,
        summary: [
          "대법원도 같은 뜻으로 보고 있어요.",
          "2020도12345 사건에서 다뤄졌어요.",
          "판례에 따르면 허가가 필요해요.",
          GOOD.summary[0],
        ],
      },
      ARTICLES,
    );
    expect(easy.summary).toEqual([GOOD.summary[0]]);
    expect(dropped).toEqual(["case_like", "case_like", "case_like"]);
  });

  test("법원 이름은 그 법 조문이 직접 쓰는 낱말이면 설명에 남긴다 (가상 사례는 예외 없이 뺀다)", () => {
    const withCourt: EasyArticle[] = [
      ...ARTICLES,
      {
        articleNo: "제60조",
        title: "관할",
        text: "제60조(관할) 이 법에 따른 사건은 지방법원이 관할한다.",
      },
    ];
    const raw = {
      ...GOOD,
      summary: ["사건은 지방법원이 맡도록 정하고 있어요."],
      virtualCases: [{ ...GOOD.virtualCases[0], lawSays: "지방법원이 맡도록 정하고 있어요." }],
    };
    const { easy, dropped } = screenEasy(raw, withCourt);
    expect(easy.summary).toHaveLength(1);
    expect(easy.virtualCases).toEqual([]);
    expect(dropped).toEqual(["case_like"]);
  });

  test("단정 표현과 확률처럼 읽히는 표시는 뺀다", () => {
    const { easy, dropped } = screenEasy(
      {
        ...GOOD,
        who: ["허가 없이 만들면 반드시 처벌받습니다.", "절반(50%)의 사업자"],
        issues: [{ question: "무조건 허가를 받아야 하나요?", articleNo: "제6조" }],
      },
      ARTICLES,
    );
    expect(easy.who).toEqual([]);
    expect(easy.issues).toEqual([]);
    expect(dropped).toEqual(["assertive", "percent", "assertive"]);
  });

  test("숫자는 조문 원문에 있는 것만 쓸 수 있다", () => {
    const { easy, dropped } = screenEasy(
      {
        ...GOOD,
        keyPoints: [
          {
            title: "어기면 벌칙이 있어요",
            body: "허가 없이 만들면 5년 이하의 징역이나 5천만원 이하의 벌금에 처하도록 정하고 있어요.",
            articleNo: "제51조",
          },
          {
            title: "지어낸 기간",
            body: "신고는 30일 안에 하도록 정하고 있어요.",
            articleNo: "제17조",
          },
          {
            title: "지어낸 금액",
            body: "어기면 과태료 300만 원을 내도록 정하고 있어요.",
            articleNo: "제51조",
          },
        ],
      },
      ARTICLES,
    );
    expect(easy.keyPoints.map((k) => k.title)).toEqual(["어기면 벌칙이 있어요"]);
    expect(dropped).toEqual(["number_not_in_source", "number_not_in_source"]);
  });

  test("가상 사례: 사람 이름·회사 이름·판결 언급이 있으면 빼고, 최대 2개만 남긴다", () => {
    const v = GOOD.virtualCases[0];
    const { easy, dropped } = screenEasy(
      {
        ...GOOD,
        virtualCases: [
          { ...v, situation: "김철수 씨가 허가 없이 의료기기를 만들었어요." },
          { ...v, situation: "주식회사 가나메디가 허가 없이 의료기기를 만들었어요." },
          { ...v, lawSays: "법원은 벌금을 선고했어요." },
          { ...v, situation: "박○○ 씨가 신고 없이 팔았어요." },
          v,
          { ...v, title: "신고 없이 판 경우" },
          { ...v, title: "세 번째" },
        ],
      },
      ARTICLES,
    );
    expect(easy.virtualCases.map((c) => c.title)).toEqual([
      "허가 없이 만든 경우",
      "신고 없이 판 경우",
    ]);
    expect(dropped).toEqual([
      "person_name",
      "person_name",
      "case_like",
      "person_name",
      "over_limit",
    ]);
  });

  test("실제 판례가 충분하면(allowVirtual false) 가상 사례를 모두 뺀다", () => {
    expect(screenEasy(GOOD, ARTICLES, { allowVirtual: false }).easy.virtualCases).toEqual([]);
  });

  test("연락처 같은 개인정보가 섞인 줄과 너무 긴 줄은 뺀다", () => {
    const { easy, dropped } = screenEasy(
      {
        ...GOOD,
        who: ["문의는 010-1234-5678로 하면 돼요.", "가".repeat(EASY_LIMITS.who.chars + 1)],
      },
      ARTICLES,
    );
    expect(easy.who).toEqual([]);
    expect(dropped).toHaveLength(2);
    expect(dropped).toContain("too_long");
  });

  test("모양이 다른 입력은 빈 결과가 된다 (오류 아님)", () => {
    for (const raw of [null, "글", { summary: "문자열", keyPoints: [null, 3] }]) {
      const { easy } = screenEasy(raw, ARTICLES);
      expect(easyUsable(easy)).toBe(false);
    }
  });
});

describe("DEC-074 AI 없는 정리", () => {
  test("한눈에 보기는 목적 조문의 첫 문장, 핵심 내용은 제목 있는 조문의 첫 문장", () => {
    const e = fallbackEasy("의료기기법", ARTICLES);
    expect(e.summary).toEqual([
      "이 법은 의료기기의 제조ㆍ수입 및 판매 등에 관한 사항을 규정함으로써 의료기기의 효율적인 관리를 도모하고 국민보건 향상에 이바지함을 목적으로 한다.",
    ]);
    expect(e.keyPoints).toHaveLength(5);
    expect(e.keyPoints[1]).toEqual({
      title: "제조업의 허가 등",
      body: "의료기기의 제조를 업으로 하려는 자는 식품의약품안전처장의 제조업허가를 받아야 한다.",
      articleNo: "제6조",
    });
    expect(e.issues).toEqual([]);
    expect(e.who).toEqual([]);
    expect(e.virtualCases).toEqual([]);
  });

  test("목적 조문이 없으면 한눈에 보기 없이, 조문이 없으면 모두 빈 값", () => {
    expect(fallbackEasy("가상법", ARTICLES.slice(2)).summary).toEqual([]);
    const none = fallbackEasy("가상법", []);
    expect([none.summary, none.keyPoints]).toEqual([[], []]);
  });

  test("첫 문장: 조문 머리(번호·제목·항 번호)를 떼고 길면 자른다", () => {
    expect(firstSentence("제3조의2(가상) ① 첫 문장이다. 둘째 문장이다.")).toBe("첫 문장이다.");
    expect(firstSentence("가".repeat(300), 50)).toHaveLength(50);
  });
});
