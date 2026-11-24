// @vitest-environment node
// F-016 사건 진행 순서 규칙 (DEC-053): 저장 자료 검증, 서류 판독 결과 거르기, 모델에 보낼 글 가리기, 기업 조사 요청·결과 거르기.
// 아래 이름·회사는 모두 가상이다.
import { describe, expect, test } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  COMPANY_LIMITS,
  MATTER_LIMITS,
  companyNoteBody,
  isKnownUnreadable,
  composeIssueText,
  emptyMatter,
  maskForModel,
  mergeReading,
  parseCompanyRequest,
  parseMatterData,
  parseTextRequest,
  parseTitle,
  readMatterData,
  safeHttpUrl,
  screenCompanyReport,
  screenMatterReading,
  sortFacts,
  type MatterData,
  type MatterReadingRaw,
} from "./policy";

const reasonOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return { code: e.code, ...e.details };
    throw e;
  }
  return null;
};

const RAW: MatterReadingRaw = {
  readable: true,
  doc: {
    type: "통지서",
    title: "[공식통지] 사고 통보",
    date: "2030년 3월 2일",
    gist: "사고 경위와 요구를 알린 통지서.",
  },
  parties: [
    { name: "가상홀딩스 Inc.", kind: "business", side: "claimant", role: "발신", note: "" },
    {
      name: "주식회사 가상솔루션",
      kind: "business",
      side: "respondent",
      role: "수신 · 수탁사",
      note: "",
    },
    { name: "김가상", kind: "person", side: "respondent", role: "대표이사", note: "" },
    { name: "외부 공격자", kind: "robot", side: "enemy", role: "신원 미상", note: "" },
  ],
  relations: [
    { from: "가상홀딩스 Inc.", to: "주식회사 가상솔루션", label: "용역 계약" },
    { from: "주식회사 가상솔루션", to: "없는 회사", label: "하도급" },
  ],
  facts: [
    { when: "2029-11-03 18:17", what: "노출된 키로 처음 로그인이 있었다고 발신인은 적었습니다." },
    { when: "2029-06-01", what: "연동 앱을 만들었다고 적혀 있습니다." },
    { when: "", what: "담당자 연락처는 010-1234-5678, a@b.co.kr입니다." },
  ],
  demands: [{ what: "자료를 그대로 보전할 것", due: "수령 즉시" }],
  clauses: [{ ref: "일반조건 제10조 제2항", gist: "유출 방지 조치 의무라고 적혀 있습니다." }],
};

describe("F-016 AC2 서류 판독 결과 거르기", () => {
  test("본인 사건 정리라 이름은 남기고, 연락처·번호는 가린다", () => {
    const r = screenMatterReading(RAW)!;
    expect(r.parties.map((p) => p.name)).toContain("김가상");
    const all = JSON.stringify(r);
    expect(all).not.toContain("010-1234-5678");
    expect(all).not.toContain("a@b.co.kr");
    expect(r.facts[2].what).toContain("[전화번호]");
  });

  test("종류·자리는 정해진 값만, 관계는 목록에 있는 당사자끼리만", () => {
    const r = screenMatterReading(RAW)!;
    expect(r.parties[3]).toMatchObject({ kind: "group", side: "other" });
    expect(r.relations).toEqual([
      { from: "가상홀딩스 Inc.", to: "주식회사 가상솔루션", label: "용역 계약" },
    ]);
    expect(r.doc.type).toBe("통지서");
    expect(
      screenMatterReading({ ...RAW, doc: { ...RAW.doc, type: "김가상 차용증" } })!.doc.type,
    ).toBe("기타");
  });

  test("서류가 든 조항은 서류에 적힌 이름 그대로 남긴다 (정리 도구 — 근거 인용이 아니다)", () => {
    expect(screenMatterReading(RAW)!.clauses[0].ref).toBe("일반조건 제10조 제2항");
  });

  test("단정 표현이 든 문장은 비우고, 읽지 못했으면 null", () => {
    const r = screenMatterReading({
      ...RAW,
      facts: [...RAW.facts, { when: "", what: "수신인이 반드시 배상하게 됩니다." }],
    })!;
    expect(r.facts.some((f) => f.what.includes("반드시"))).toBe(false);
    expect(screenMatterReading({ ...RAW, readable: false })).toBeNull();
    expect(screenMatterReading({ ...RAW, parties: [], facts: [], demands: [] })).toBeNull();
  });
});

describe("F-016 AC1 사건 자료 합치기·저장 검증", () => {
  const reading = screenMatterReading(RAW)!;

  test("읽은 서류를 합친다: 같은 이름의 당사자는 하나, 사실·요구·조항은 그 서류에 묶인다", () => {
    const once = mergeReading(emptyMatter(), reading, 5);
    const twice = mergeReading(once, reading, 5);
    expect(once.docs).toHaveLength(1);
    expect(once.docs[0]).toMatchObject({ title: "[공식통지] 사고 통보", pages: 5 });
    expect(twice.parties).toHaveLength(once.parties.length);
    expect(twice.relations).toHaveLength(once.relations.length);
    expect(twice.facts).toHaveLength(once.facts.length * 2);
    expect(once.facts.every((f) => f.docId === once.docs[0].id)).toBe(true);
    const [from, to] = [once.relations[0].from, once.relations[0].to];
    expect(once.parties.find((p) => p.id === from)?.name).toBe("가상홀딩스 Inc.");
    expect(once.parties.find((p) => p.id === to)?.name).toBe("주식회사 가상솔루션");
  });

  test("사실은 날짜순으로, 날짜가 없으면 뒤로", () => {
    const data = mergeReading(emptyMatter(), reading, 1);
    expect(sortFacts(data.facts).map((f) => f.when)).toEqual([
      "2029-06-01",
      "2029-11-03 18:17",
      "",
    ]);
  });

  test("저장 자료는 모양·길이·개수를 확인하고, 모르는 키와 연락처는 남기지 않는다", () => {
    const data = mergeReading(emptyMatter(), reading, 1);
    const saved = parseMatterData({
      ...data,
      extra: "x",
      summary: "담당자 010-9999-8888에게 연락",
      notes: [
        {
          id: "n1",
          title: "메모",
          body: "본문",
          kind: "memo",
          refs: [],
          sources: [{ title: "출처", url: "https://example.com" }],
          byAi: false,
          at: "2030-01-01",
        },
      ],
    });
    expect(saved).not.toHaveProperty("extra");
    expect(saved.summary).toBe("담당자 [전화번호]에게 연락");
    expect(saved.parties.map((p) => p.name)).toContain("김가상");
    expect(reasonOf(() => parseMatterData({ ...data, version: 2 }))).toMatchObject({
      code: "VALIDATION_ERROR",
      reason: "format",
    });
    expect(
      reasonOf(() =>
        parseMatterData({
          ...data,
          notes: [
            {
              id: "n",
              title: "t",
              body: "b",
              kind: "memo",
              refs: [],
              sources: [{ title: "x", url: "javascript:alert(1)" }],
              byAi: false,
              at: "",
            },
          ],
        }),
      ),
    ).toMatchObject({ reason: "format" });
    const many = Array.from({ length: MATTER_LIMITS.facts + 1 }, (_, i) => ({
      id: `f${i}`,
      when: "",
      what: "가",
      docId: null,
    }));
    expect(reasonOf(() => parseMatterData({ ...data, facts: many }))?.code).toBe(
      "VALIDATION_ERROR",
    );
  });

  test("오류에는 사건 내용이 들어가지 않는다 (F-007)", () => {
    const err = reasonOf(() =>
      parseMatterData({ ...emptyMatter(), summary: 123, secret: "김가상 사건" }),
    );
    expect(JSON.stringify(err)).not.toContain("김가상");
    expect(err).toMatchObject({ fields: ["data.summary"] });
  });

  test("사건 이름: 비면 EMPTY_INPUT, 길면 거절, 연락처는 가린다. 손상된 저장 값은 빈 사건으로 읽는다", () => {
    expect(reasonOf(() => parseTitle(" "))?.code).toBe("EMPTY_INPUT");
    expect(reasonOf(() => parseTitle("가".repeat(MATTER_LIMITS.titleChars + 1)))).toMatchObject({
      reason: "too_long",
    });
    expect(parseTitle("  가상  사건 010-1234-5678 ")).toBe("가상 사건 [전화번호]");
    expect(readMatterData({ nope: true })).toEqual(emptyMatter());
  });
});

describe("F-016 AC3 모델에 보낼 글 (절대 규칙 4)", () => {
  const data: MatterData = {
    ...mergeReading(emptyMatter(), screenMatterReading(RAW)!, 1),
    summary: "가상솔루션이 받은 통지",
    mySide: "respondent",
  };

  test("쟁점 정리 글은 한도 안이고, 서버가 이름·연락처를 가린 뒤에만 쓴다", () => {
    const text = composeIssueText(data);
    expect(text.length).toBeLessThanOrEqual(2_000);
    expect(text).toContain("질문자의 자리: 요구·청구를 받은 쪽");
    const masked = maskForModel(text, ["김가상"]);
    expect(masked.text).not.toContain("김가상");
    expect(masked.text).not.toContain("010-1234-5678");
    // 회사 이름은 그대로 둔다 (검색·정리에 필요하다)
    expect(masked.text).toContain("주식회사 가상솔루션");
  });

  test("글 요청은 비거나 길면 거절하고 이름 목록은 문자열만 받는다", () => {
    expect(reasonOf(() => parseTextRequest({ text: " " }, 100))?.code).toBe("EMPTY_INPUT");
    expect(reasonOf(() => parseTextRequest({ text: "가".repeat(101) }, 100))).toMatchObject({
      reason: "too_long",
    });
    expect(
      parseTextRequest({ text: "글", personNames: ["김가상", 3, "가".repeat(41)] }, 100),
    ).toEqual({
      text: "글",
      personNames: ["김가상"],
    });
  });
});

describe("F-016 AC4 기업 조사 요청·결과", () => {
  test("링크는 공개 http(s) 주소만, 개수 한도 안에서 받는다", () => {
    expect(safeHttpUrl("https://example.co.kr/about")).toBe("https://example.co.kr/about");
    for (const bad of [
      "javascript:alert(1)",
      "http://localhost:3000",
      "http://192.168.0.1/",
      "file:///etc/passwd",
      "http://intra.local/x",
      "not a url",
    ]) {
      expect(safeHttpUrl(bad), bad).toBeNull();
    }
    expect(safeHttpUrl("https://user:pw@example.com/")).toBe("https://example.com/");
    expect(
      parseCompanyRequest({
        name: " 가상랩 ",
        urls: ["https://example.com", "https://example.com"],
        pasted: " 글 ",
      }),
    ).toEqual({
      name: "가상랩",
      urls: ["https://example.com/"],
      pasted: "글",
      personNames: [],
      consent: false,
    });
    const five = Array.from(
      { length: COMPANY_LIMITS.urls + 1 },
      (_, i) => `https://example.com/${i}`,
    );
    expect(reasonOf(() => parseCompanyRequest({ name: "가상랩", urls: five }))).toMatchObject({
      reason: "too_many",
    });
    expect(
      reasonOf(() => parseCompanyRequest({ name: "가상랩", urls: ["ftp://x.com"] })),
    ).toMatchObject({ fields: ["urls"] });
  });

  test("자동 접근을 막은 것으로 확인된 사이트를 안다", () => {
    expect(isKnownUnreadable("https://blog.naver.com/someone/123")).toBe(true);
    expect(isKnownUnreadable("https://m.blog.naver.com/someone/123")).toBe(true);
    expect(isKnownUnreadable("https://example.co.kr/")).toBe(false);
    expect(isKnownUnreadable("not a url")).toBe(false);
  });

  test("연락처가 섞인 이름은 외부 검색으로 보내지 않는다", () => {
    expect(reasonOf(() => parseCompanyRequest({ name: "가상랩 010-1234-5678" }))).toMatchObject({
      reason: "contact_info",
    });
    expect(reasonOf(() => parseCompanyRequest({ name: " " }))?.code).toBe("EMPTY_INPUT");
  });

  test("조사 글에서 평가·단정 문장과 연락처를 뺀다 (절대 규칙 2·4)", () => {
    const r = screenCompanyReport({
      overview:
        "커피 원두를 볶아 파는 회사라고 홈페이지에 적혀 있습니다. 믿을 만한 회사입니다. 투자 가치가 높습니다.",
      products: ["원두 정기 배송 — 가정용", "반드시 성공할 제품", "문의 02-123-4567"],
      business: "자료에서 확인하지 못했습니다",
      items: ["직화 로스팅"],
      basics: ["2011년 설립", "강원도 강릉시"],
      unknowns: ["매출 규모"],
    })!;
    expect(r.overview).toBe("커피 원두를 볶아 파는 회사라고 홈페이지에 적혀 있습니다.");
    expect(r.products).toEqual(["원두 정기 배송 — 가정용", "문의 [전화번호]"]);
    expect(
      screenCompanyReport({
        overview: "",
        products: [],
        business: "",
        items: [],
        basics: [],
        unknowns: [],
      }),
    ).toBeNull();
    const body = companyNoteBody(r);
    expect(body).toContain("■ 무엇을 하는 회사인가");
    expect(body).toContain("- 2011년 설립");
  });
});

describe("F-016 AC4 회사만 조사한다 (개인 조사 금지)", () => {
  test("사람 이름 꼴·직함이 붙은 이름과 개인 계정 사이트는 받지 않는다", async () => {
    const { looksLikeCompanyName } = await import("./policy");
    for (const ok of ["가상랩", "주식회사 가상솔루션", "Hanbit Labs Inc.", "서울중앙지방법원"]) {
      expect(looksLikeCompanyName(ok), ok).toBe(true);
    }
    for (const no of ["김가상", "홍길동 변호사", "박가상 대표", "이가상 씨"]) {
      expect(looksLikeCompanyName(no), no).toBe(false);
      expect(
        reasonOf(() => parseCompanyRequest({ name: no })),
        no,
      ).toMatchObject({
        reason: "not_business",
      });
    }
    expect(
      reasonOf(() =>
        parseCompanyRequest({ name: "가상랩", urls: ["https://www.instagram.com/someone"] }),
      ),
    ).toMatchObject({ reason: "personal_site" });
  });

  test("검증하지 않은 사건번호 문장은 빼고, 공개 자료의 대표자 이름은 남긴다", () => {
    const r = screenCompanyReport({
      overview:
        "김가상 대표가 세운 회사라고 적혀 있습니다. 대법원 2020다12345 판결에서 졌다고 합니다.",
      products: [],
      business: "",
      items: [],
      basics: [],
      unknowns: [],
    })!;
    expect(r.overview).toBe("김가상 대표가 세운 회사라고 적혀 있습니다.");
  });
});
