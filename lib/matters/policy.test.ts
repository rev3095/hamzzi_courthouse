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

const MATTER_ID = "11111111-2222-4333-8444-555555555555";
/** 기업 조사 요청에 늘 붙는 값 (사건 번호·회사 이름 확인) */
const CO = { matterId: MATTER_ID, isBusiness: true };

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

  test("긴 기관 이름·관계·기한은 저장 한도까지 잘리지 않고, 판독 결과가 그대로 저장 검증을 통과한다", () => {
    const longOrg = `가상${"정보보호".repeat(20)}위원회`; // 85자
    const longLabel = "가상 클라우드 서비스 이용 및 데이터 처리 위탁 기본계약 제2차 변경계약";
    const longDue = "이 통지서를 받은 날부터 영업일 기준으로 셈한 기한 안에, 위 요구와 동일 기한";
    const r = screenMatterReading({
      ...RAW,
      parties: [
        ...RAW.parties,
        { name: longOrg, kind: "agency", side: "other", role: "", note: "" },
      ],
      relations: [{ from: "주식회사 가상솔루션", to: longOrg, label: longLabel }],
      demands: [{ what: "자료를 보전할 것", due: longDue }],
    })!;
    expect(r.parties.map((p) => p.name)).toContain(longOrg);
    expect(r.relations).toEqual([{ from: "주식회사 가상솔루션", to: longOrg, label: longLabel }]);
    expect(r.demands[0].due).toBe(longDue);
    const saved = parseMatterData(mergeReading(emptyMatter(), r, 1));
    expect(saved.parties.map((p) => p.name)).toContain(longOrg);
    expect(saved.relations[0].label).toBe(longLabel);
  });

  test("저장 한도를 넘는 글은 한도에 맞춰 줄임표로 자른다", () => {
    const r = screenMatterReading({
      ...RAW,
      relations: [{ from: "가상홀딩스 Inc.", to: "주식회사 가상솔루션", label: "가".repeat(300) }],
    })!;
    expect(r.relations[0].label).toHaveLength(MATTER_LIMITS.short);
    expect(r.relations[0].label.endsWith("…")).toBe(true);
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
      parseTextRequest(
        { matterId: MATTER_ID, text: "글", personNames: ["김가상", 3, "가".repeat(41)] },
        100,
      ),
    ).toEqual({
      text: "글",
      matterId: MATTER_ID,
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
        ...CO,
        name: " 가상랩 ",
        urls: ["https://example.com", "https://example.com"],
        pasted: " 글 ",
      }),
    ).toEqual({
      name: "가상랩",
      matterId: MATTER_ID,
      urls: ["https://example.com/"],
      pasted: "글",
      personNames: [],
      consent: false,
    });
    const five = Array.from(
      { length: COMPANY_LIMITS.urls + 1 },
      (_, i) => `https://example.com/${i}`,
    );
    expect(
      reasonOf(() => parseCompanyRequest({ ...CO, name: "가상랩", urls: five })),
    ).toMatchObject({
      reason: "too_many",
    });
    expect(
      reasonOf(() => parseCompanyRequest({ ...CO, name: "가상랩", urls: ["ftp://x.com"] })),
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
    const { looksLikePersonName, hasBusinessMark } = await import("./policy");
    for (const ok of ["가상랩", "주식회사 가상솔루션", "Hanbit Labs Inc.", "서울중앙지방법원"]) {
      expect(looksLikePersonName(ok), ok).toBe(false);
    }
    expect(hasBusinessMark("주식회사 가상솔루션")).toBe(true);
    expect(hasBusinessMark("가상랩")).toBe(false);
    for (const no of ["김가상", "홍길동 변호사", "박가상 대표", "이가상 씨"]) {
      expect(looksLikePersonName(no), no).toBe(true);
      expect(
        reasonOf(() => parseCompanyRequest({ ...CO, name: no })),
        no,
      ).toMatchObject({
        reason: "not_business",
      });
    }
    expect(
      reasonOf(() =>
        parseCompanyRequest({ ...CO, name: "가상랩", urls: ["https://www.instagram.com/someone"] }),
      ),
    ).toMatchObject({ reason: "personal_site" });
  });

  test("글자 모양으로 못 거르는 이름(목록에 없는 성씨·외국 이름·로마자)은 회사라는 확인 없이 받지 않는다", () => {
    for (const name of ["추가상", "가상 머스크", "가상랩"]) {
      expect(
        reasonOf(() => parseCompanyRequest({ matterId: MATTER_ID, name })),
        name,
      ).toMatchObject({ reason: "confirm_business" });
    }
    // 로마자 사람 이름 꼴은 확인이 있어도 받지 않는다 (회사는 Inc.·Ltd. 같은 표지를 붙여 적는다)
    expect(reasonOf(() => parseCompanyRequest({ ...CO, name: "Jane Doe" }))).toMatchObject({
      reason: "not_business",
    });
    expect(parseCompanyRequest({ ...CO, name: "Jane Doe Inc." }).name).toBe("Jane Doe Inc.");
    // 상호·기관 표지가 있으면 확인 없이 받는다
    expect(parseCompanyRequest({ matterId: MATTER_ID, name: "㈜가상랩" }).name).toBe("(주)가상랩");
    // 사건 번호가 없으면 받지 않는다 (가릴 이름을 서버가 모은다)
    expect(reasonOf(() => parseCompanyRequest({ isBusiness: true, name: "가상랩" }))).toMatchObject(
      {
        fields: ["matterId"],
      },
    );
  });

  test("모델의 거절 값을 알아본다", async () => {
    const { isCompanyRefusal } = await import("./policy");
    expect(isCompanyRefusal({ refused: "person" })).toBe(true);
    expect(isCompanyRefusal({ overview: "x" })).toBe(false);
    expect(isCompanyRefusal(null)).toBe(false);
  });

  test("검증하지 않은 사건번호 문장은 빼고, 대표자 이름은 basics의 '대표자:' 한 항목에만 남긴다 (DEC-053)", () => {
    const r = screenCompanyReport({
      overview:
        "원두를 볶아 파는 회사라고 적혀 있습니다. 김가상 대표가 세운 회사라고 적혀 있습니다. 대법원 2020다12345 판결에서 졌다고 합니다.",
      products: ["원두 정기 배송", "박가상 팀장이 만든 블렌드"],
      business: "",
      items: [],
      basics: [
        "대표자: 김가상 (홈페이지 회사 소개)",
        "대표자: 이가상 (다른 사이트)",
        "2011년 설립",
        "업계 대표적인 로스터리라고 소개 글에 적혀 있습니다",
      ],
      unknowns: [],
    })!;
    expect(r.overview).toBe("원두를 볶아 파는 회사라고 적혀 있습니다.");
    expect(r.products).toEqual(["원두 정기 배송"]);
    expect(r.basics).toEqual([
      "대표자: 김가상 (홈페이지 회사 소개)",
      "2011년 설립",
      "업계 대표적인 로스터리라고 소개 글에 적혀 있습니다",
    ]);
  });
});

describe("F-016 AC2 서류 속 법령 조문·사건번호는 재조회로 확인된 것만 (절대 규칙 1)", () => {
  test("법령 이름이 앞에 있는 조문과 사건번호만 재조회 대상이고, 계약 조항은 아니다", async () => {
    const { citationSpans } = await import("./policy");
    expect(
      citationSpans(
        "민법 제681조에 따라 「근로기준법」 제23조와 2020다12345 판결을 들었습니다.",
      ).map((s) => [s.kind, s.candidates[0]]),
    ).toEqual([
      ["statute", "민법 제681조"],
      ["statute", "근로기준법 제23조"],
      ["case", "2020다12345"],
    ]);
    expect(citationSpans("계약서 제5조와 일반조건 제10조 제2항, 2030년 3월 2일")).toEqual([]);
    expect(citationSpans("2025차전12345 지급명령").map((s) => s.candidates)).toEqual([
      ["2025차전12345"],
    ]);
  });

  test("확인되지 않은 번호는 글에서 가리고, 조항 목록에서는 항목째 뺀다. 확인된 조문에는 법제처 주소를 붙인다", async () => {
    const { applyReadingChecks, readingClaims, UNCHECKED_ARTICLE, UNCHECKED_CASE } =
      await import("./policy");
    const reading = screenMatterReading({
      ...RAW,
      facts: [
        { when: "", what: "발신인은 민법 제681조와 2020다12345 판결을 들었습니다." },
        { when: "", what: "발신인은 가상법 제999조를 들었습니다." },
      ],
      clauses: [
        { ref: "민법 제681조", gist: "선관주의 의무라고 적혀 있습니다." },
        { ref: "가상법 제999조", gist: "없는 조문." },
        { ref: "계약서 제5조", gist: "손해배상 조항." },
      ],
    })!;
    expect(readingClaims(reading)).toEqual({
      statutes: ["민법 제681조", "가상법 제999조"],
      cases: ["2020다12345"],
    });
    const { reading: out, removed } = applyReadingChecks(reading, new Set(["민법 제681조"]));
    expect(out.facts.map((f) => f.what)).toEqual([
      `발신인은 민법 제681조와 ${UNCHECKED_CASE} 판결을 들었습니다.`,
      `발신인은 가상법 ${UNCHECKED_ARTICLE}를 들었습니다.`,
    ]);
    expect(out.clauses.map((c) => c.ref)).toEqual(["민법 제681조", "계약서 제5조"]);
    expect(out.clauses[0].url).toContain("law.go.kr");
    expect(out.clauses[1].url).toBeUndefined();
    expect(removed).toBe(3);
    expect(JSON.stringify(out)).not.toContain("제999조");
    expect(JSON.stringify(out)).not.toContain("2020다12345");
  });

  test("재조회가 실패하면(확인된 것 없음) 모든 법령 조문·사건번호를 내보내지 않는다", async () => {
    const { applyReadingChecks } = await import("./policy");
    const reading = screenMatterReading({
      ...RAW,
      demands: [{ what: "2024가단5678 사건의 자료를 낼 것", due: "" }],
      clauses: [{ ref: "개인정보보호법 제29조", gist: "안전조치 의무." }],
    })!;
    const { reading: out } = applyReadingChecks(reading, new Set());
    expect(JSON.stringify(out)).not.toMatch(/2024가단5678|제29조/);
    expect(out.demands).toHaveLength(1);
  });
});

describe("F-016 모델로 보내는 글에서 가릴 이름은 서버가 모은다 (절대 규칙 4)", () => {
  test("개인은 모두, 종류를 잘못 고른 사람 이름 꼴도 넣고, 집단·회사 이름은 넣지 않는다", async () => {
    const { maskNamesOf } = await import("./policy");
    const data = {
      ...emptyMatter(),
      parties: [
        {
          id: "1",
          name: "김가상",
          kind: "person" as const,
          side: "other" as const,
          role: "",
          note: "",
        },
        {
          id: "2",
          name: "박가상",
          kind: "group" as const,
          side: "other" as const,
          role: "",
          note: "",
        },
        {
          id: "3",
          name: "Jane Doe",
          kind: "business" as const,
          side: "other" as const,
          role: "",
          note: "",
        },
        {
          id: "4",
          name: "외부 공격자",
          kind: "group" as const,
          side: "other" as const,
          role: "",
          note: "",
        },
        {
          id: "5",
          name: "주식회사 가상솔루션",
          kind: "business" as const,
          side: "other" as const,
          role: "",
          note: "",
        },
      ],
    };
    expect(maskNamesOf(data, ["추가상", "김가상"])).toEqual([
      "김가상",
      "박가상",
      "Jane Doe",
      "추가상",
    ]);
  });
});

describe("F-016 AC2 재검토에서 찾은 조문·사건번호 꼴 (절대 규칙 1)", () => {
  test("띄어 쓴 긴 법령 이름·「」로 묶은 이름·주어 뒤 법령 이름을 인용으로 잡는다", async () => {
    const { citationSpans } = await import("./policy");
    const first = (t: string) => citationSpans(t).map((s) => s.candidates);
    expect(first("정보통신망 이용촉진 및 정보보호 등에 관한 법률 제44조의7")[0]).toContain(
      "정보통신망 이용촉진 및 정보보호 등에 관한 법률 제44조의7",
    );
    expect(first("「약관의 규제에 관한 법률」 제6조")).toEqual([["약관의 규제에 관한 법률 제6조"]]);
    expect(first("발신인은 개인정보 보호법 제29조를 들었습니다.")).toEqual([
      ["개인정보 보호법 제29조"],
    ]);
    expect(first("민법 제681조")).toEqual([["민법 제681조"]]);
    expect(first("근로기준법 시행령 제5조")).toEqual([["근로기준법 시행령 제5조"]]);
  });

  test("앞 조문에 이어 쓴 조문은 같은 법령으로, '같은 법'은 정할 수 없어 늘 확인되지 않은 것으로", async () => {
    const { citationSpans } = await import("./policy");
    const all = (t: string) => citationSpans(t).map((s) => s.candidates);
    expect(all("민법 제390조, 제750조")).toEqual([["민법 제390조"], ["민법 제750조"]]);
    expect(all("개인정보보호법 제29조 제1항 및 제30조")).toEqual([
      ["개인정보보호법 제29조"],
      ["개인정보보호법 제30조"],
    ]);
    expect(all("민사소송법 제1조 내지 제5조")).toEqual([
      ["민사소송법 제1조"],
      ["민사소송법 제5조"],
    ]);
    expect(all("같은 법 제5조")).toEqual([[]]);
    expect(all("동법 시행령 제2조")).toEqual([[]]);
  });

  test("두 자리 연도·짧은 일련번호·병합 사건번호도 잡는다", async () => {
    const { citationSpans } = await import("./policy");
    expect(
      citationSpans("98다12345, 2019헌마12, 2020다1 및 2020다1234, 5678(병합)").flatMap(
        (s) => s.candidates,
      ),
    ).toEqual(["98다12345", "2019헌마12", "2020다1", "2020다1234", "2020다5678"]);
  });

  test("당사자 이름·관계·서류 날짜 속 번호도 가리고, 관계는 이름과 계속 맞는다", async () => {
    const { applyReadingChecks, UNCHECKED_CASE } = await import("./policy");
    const reading = screenMatterReading({
      ...RAW,
      doc: { ...RAW.doc, date: "2025가합1234 사건 2030년 3월 2일" },
      parties: [
        ...RAW.parties,
        {
          name: "서울중앙지방법원 2025가합1234 재판부",
          kind: "agency",
          side: "other",
          role: "",
          note: "",
        },
      ],
      relations: [
        { from: "가상홀딩스 Inc.", to: "서울중앙지방법원 2025가합1234 재판부", label: "소 제기" },
      ],
    })!;
    const { reading: out } = applyReadingChecks(reading, new Set());
    const court = `서울중앙지방법원 ${UNCHECKED_CASE} 재판부`;
    expect(out.parties.map((p) => p.name)).toContain(court);
    expect(out.relations[0].to).toBe(court);
    expect(out.doc.date).toBe(`${UNCHECKED_CASE} 사건 2030년 3월 2일`);
    expect(JSON.stringify(out)).not.toContain("2025가합1234");
  });
});

describe("F-016 AC2 재검토 2차 (절대 규칙 1·4)", () => {
  test("다른 나라·옛 법령, 괄호 속 개정일, 조사로 끝나는 낱말을 바르게 다룬다", async () => {
    const { citationSpans } = await import("./policy");
    const of = (t: string) => citationSpans(t).map((s) => s.candidates);
    // 꼬리("민법 제709조")로 확인되지 않게 재조회하지 않는다 → 늘 가린다
    expect(of("일본 민법 제709조")).toEqual([[]]);
    expect(of("구 민법 제5조")).toEqual([[]]);
    expect(of("개정 전 근로기준법 제5조")).toEqual([[]]);
    expect(of("근로기준법(2020. 1. 1. 개정) 제5조")).toEqual([["근로기준법 제5조"]]);
    expect(of("가상홀딩스 김가상 팀장이 근로기준법 제23조를")).toEqual([["근로기준법 제23조"]]);
    // 조사에서 끊겨 온전한 이름을 못 찾으면 그 후보는 확인되지 않아 가려진다 (안전한 쪽)
    expect(of("국가를 당사자로 하는 계약에 관한 법률 제5조")[0]).toHaveLength(1);
  });

  test("사람 이름이 섞인 재조회 문자열은 법제처로 보내지 않는다", async () => {
    const { readingClaims } = await import("./policy");
    const reading = screenMatterReading({
      ...RAW,
      // 당사자로 뽑히지 않은 이름·직함도 법제처로 보내지 않는다
      facts: [
        { when: "", what: "가상홀딩스 김가상 근로기준법 제23조 위반이라고 적었습니다." },
        { when: "", what: "가상물산 최가상 팀장 근로기준법 제24조 위반이라고 적었습니다." },
        // 법령 이름 속 낱말("이용촉진"·"정보보호")은 성씨 꼴이어도 사람 이름으로 보지 않는다
        { when: "", what: "정보통신망 이용촉진 및 정보보호 등에 관한 법률 제44조의7" },
      ],
      clauses: [],
    })!;
    const claims = readingClaims(reading);
    expect(claims.statutes.some((c) => c.includes("김가상"))).toBe(false);
    expect(claims.statutes.some((c) => c.includes("최가상") || c.includes("팀장"))).toBe(false);
    expect(claims.statutes).toContain("정보통신망 이용촉진 및 정보보호 등에 관한 법률 제44조의7");
  });

  test("대표자 항목은 이름 + (출처)만 받고 나이·학력·경력이 붙으면 뺀다", () => {
    const r = screenCompanyReport({
      overview: "원두를 볶아 판다고 적혀 있습니다.",
      products: [],
      business: "",
      items: [],
      basics: [
        "대표자: 김가상 (1975년생, 가상대 졸업)",
        "대표자: 김가상 가상대 교수 (홈페이지)",
        "2011년 설립",
      ],
      unknowns: [],
    })!;
    expect(r.basics).toEqual(["2011년 설립"]);
  });
});
