// @vitest-environment node
// F-015 서류 분석 순수 규칙 (DEC-052): 요청 검증, 판독 결과 거르기(개인 이름 없음·조문/사건번호·단정 표현), 질문 문장 합치기.
import { describe, expect, test } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { MAX_INPUT_CHARS } from "@/lib/inquiries/policy";
import {
  CASEFILE_LIMITS,
  DEFAULT_CASE_QUESTION,
  composeCaseText,
  parseReadRequest,
  DOC_TYPES,
  PARTY_ROLES,
  maskMore,
  orgNameOf,
  screenParties,
  screenReading,
  sniffImage,
  type ReadingRaw,
} from "./policy";

const b64 = (bytes: number[], pad = 64) =>
  Buffer.from([...bytes, ...Array<number>(pad).fill(0)]).toString("base64");
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = b64([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const GIF = b64([0x47, 0x49, 0x46, 0x38]);
const jpeg = { mediaType: "image/jpeg", data: JPEG };
const BOTH = { images: true, sensitive: true };

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return { code: e.code, details: e.details };
    throw e;
  }
  return null;
};

describe("F-015 AC1 요청 검증", () => {
  test("사진 종류는 내용 앞부분으로 확인한다", () => {
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(WEBP)).toBe("image/webp");
    expect(sniffImage(GIF)).toBeNull();
    expect(sniffImage("***")).toBeNull();
  });

  test("동의가 없으면 아무것도 처리하지 않고 CONSENT_REQUIRED", () => {
    expect(codeOf(() => parseReadRequest({ images: [jpeg] }))).toEqual({
      code: "CONSENT_REQUIRED",
      details: { kind: "casefile_images" },
    });
    expect(codeOf(() => parseReadRequest({ images: [jpeg], consent: true }))?.code).toBe(
      "CONSENT_REQUIRED",
    );
    // 사진 전송과 민감정보 처리는 따로 동의받는다
    expect(
      codeOf(() => parseReadRequest({ images: [jpeg], consent: { images: true } }))?.details,
    ).toEqual({ kind: "sensitive_info" });
    expect(
      codeOf(() => parseReadRequest({ images: [jpeg], consent: { sensitive: true } }))?.details,
    ).toEqual({ kind: "casefile_images" });
    expect(parseReadRequest({ images: [jpeg], consent: BOTH, question: " 어떻게 하죠 " })).toEqual({
      images: [jpeg],
      texts: [],
      question: "어떻게 하죠",
    });
  });

  test("사진이 없으면 EMPTY_INPUT, 장수·크기·종류가 맞지 않으면 VALIDATION_ERROR", () => {
    expect(codeOf(() => parseReadRequest({ images: [], consent: BOTH }))?.code).toBe("EMPTY_INPUT");
    expect(codeOf(() => parseReadRequest({ consent: BOTH }))?.code).toBe("EMPTY_INPUT");
    const many = Array(CASEFILE_LIMITS.maxImages + 1).fill(jpeg);
    expect(codeOf(() => parseReadRequest({ images: many, consent: BOTH }))?.details).toMatchObject({
      reason: "too_many",
    });
    const big = { mediaType: "image/jpeg", data: JPEG + "A".repeat(CASEFILE_LIMITS.maxImageChars) };
    expect(codeOf(() => parseReadRequest({ images: [big], consent: BOTH }))?.details).toMatchObject(
      { reason: "too_large" },
    );
    // 적어 보낸 종류와 실제 내용이 다르다
    expect(
      codeOf(() =>
        parseReadRequest({ images: [{ mediaType: "image/png", data: JPEG }], consent: BOTH }),
      )?.details,
    ).toMatchObject({ reason: "media_type" });
    expect(
      codeOf(() =>
        parseReadRequest({ images: [{ mediaType: "image/gif", data: GIF }], consent: BOTH }),
      )?.details,
    ).toMatchObject({ reason: "media_type" });
    expect(
      codeOf(() =>
        parseReadRequest({
          images: [{ mediaType: "image/jpeg", data: `${JPEG}\n!!` }],
          consent: BOTH,
        }),
      )?.details,
    ).toMatchObject({ reason: "encoding" });
  });

  test("오류에는 사진·질문 내용이 들어가지 않는다 (F-007)", () => {
    const long = "가".repeat(CASEFILE_LIMITS.questionChars + 1);
    const err = codeOf(() => parseReadRequest({ images: [jpeg], consent: BOTH, question: long }));
    expect(err?.details).toEqual({
      fields: ["question"],
      reason: "too_long",
      maxChars: CASEFILE_LIMITS.questionChars,
    });
    expect(JSON.stringify(err)).not.toContain("가가");
  });
});

const RAW: ReadingRaw = {
  readable: true,
  docTypes: ["내용증명", "임대차계약서"],
  summary:
    "발신인은 수신인과 전세 계약을 맺었습니다. 계약은 지난달에 끝났습니다. 수신인은 보증금을 돌려주지 않았습니다.",
  claims: ["보증금을 돌려 달라고 요구합니다."],
  parties: [
    { role: "발신인", side: "claimant", kind: "person", name: "김민수" },
    { role: "수신인", side: "respondent", kind: "business", name: "주식회사 한빛주택" },
  ],
  personNames: ["김민수"],
};

describe("F-015 AC2 판독 결과 거르기", () => {
  test("개인은 이름을 버리고, 법인·사업자 이름만 남긴다", () => {
    const out = screenReading(RAW)!;
    expect(out.reading.parties).toEqual([
      { role: "발신인", side: "claimant", kind: "person", name: "" },
      { role: "수신인", side: "respondent", kind: "business", name: "주식회사 한빛주택" },
    ]);
    expect(JSON.stringify(out)).not.toContain("김민수");
  });

  test("사건 개요에 남은 이름·연락처는 가린다 — 값은 남기지 않고 종류와 개수만", () => {
    const out = screenReading({
      ...RAW,
      summary: "임대인 박영호 씨는 보증금을 돌려주지 않았습니다. 연락처는 010-1234-5678입니다.",
    })!;
    expect(out.reading.summary).not.toContain("박영호");
    expect(out.reading.summary).not.toContain("010-1234-5678");
    expect(out.reading.summary).toContain("[전화번호]");
    expect(out.findings.map((f) => f.type)).toEqual(expect.arrayContaining(["name", "phone"]));
  });

  test("조문 번호·사건번호가 든 문장과 단정 표현 문장은 뺀다 (절대 규칙 1·2)", () => {
    const out = screenReading({
      ...RAW,
      summary:
        "발신인은 보증금 반환을 요구했습니다. 민법 제390조에 따라 손해를 배상해야 한다고 적었습니다. 이 사건은 2025가단12345로 진행 중입니다. 발신인이 반드시 승소합니다.",
      claims: ["보증금을 돌려 달라고 요구합니다.", "무조건 처벌받게 하겠다고 합니다."],
    })!;
    expect(out.reading.summary).toBe("발신인은 보증금 반환을 요구했습니다.");
    expect(out.reading.claims).toEqual(["보증금을 돌려 달라고 요구합니다."]);
    expect(out.dropped).toBe(4);
  });

  test("읽지 못했거나 남은 문장이 없으면 null", () => {
    expect(screenReading({ ...RAW, readable: false })).toBeNull();
    expect(screenReading({ ...RAW, summary: "  " })).toBeNull();
    expect(screenReading({ ...RAW, summary: "반드시 이깁니다." })).toBeNull();
  });

  test("사건 개요는 한도 안에서 문장 단위로 끊는다", () => {
    const sentence = "수신인은 보증금을 돌려주지 않았습니다.";
    const out = screenReading({ ...RAW, summary: Array(120).fill(sentence).join(" ") })!;
    expect(out.reading.summary.length).toBeLessThanOrEqual(CASEFILE_LIMITS.summaryChars);
    expect(out.reading.summary.endsWith("않았습니다.")).toBe(true);
  });

  test("역할·자리·종류는 정해진 값만, 이름에 연락처가 섞이면 이름을 비운다", () => {
    expect(
      screenParties([
        { role: "악당", side: "enemy", kind: "robot", name: "아무개" },
        { role: "피고", side: "respondent", kind: "business", name: "한빛상사 02-123-4567" },
        { role: "기타", side: "other", kind: "agency", name: "서울중앙지방법원" },
        { role: "기타", side: "other", kind: "agency", name: "서울중앙지방법원" },
      ]),
    ).toEqual([
      { role: "기타", side: "other", kind: "person", name: "" },
      { role: "피고", side: "respondent", kind: "business", name: "" },
      { role: "기타", side: "other", kind: "agency", name: "서울중앙지방법원" },
    ]);
  });
});

describe("F-015 AC3 질문 문장 합치기", () => {
  test("서류 종류·개요·요구·내 자리·질문을 한 문장으로 합친다", () => {
    const text = composeCaseText({
      docTypes: ["내용증명"],
      summary: " 발신인은 보증금 반환을 요구했습니다. ",
      claims: ["보증금을 돌려 달라고 요구합니다."],
      mySide: "respondent",
      question: "어떻게 답해야 하나요?",
    });
    expect(text).toBe(
      [
        "서류 분석 요청. 서류 종류: 내용증명",
        "사건 개요: 발신인은 보증금 반환을 요구했습니다.",
        "서류의 요구·주장: 보증금을 돌려 달라고 요구합니다.",
        "질문자의 자리: 요구·청구를 받은 쪽",
        "질문: 어떻게 답해야 하나요?",
      ].join("\n"),
    );
  });

  test("질문을 비우면 상황 정리(양쪽 입장·대응·쟁점·반론·문서, DEC-068)를 묻고, 자리를 모르면 그 줄을 뺀다", () => {
    const text = composeCaseText({
      docTypes: [],
      summary: "개요",
      claims: [],
      mySide: "unknown",
      question: " ",
    });
    expect(text).toContain("서류 종류: 적지 않음");
    expect(text).not.toContain("질문자의 자리");
    expect(text).toContain(DEFAULT_CASE_QUESTION);
    expect(DEFAULT_CASE_QUESTION).toMatch(/민사와 형사.*입장.*대응.*쟁점.*반론.*문서/);
  });

  test("가득 채운 사건 개요와 질문은 질문 한도(2,000자) 안에 들어간다", () => {
    const text = composeCaseText({
      docTypes: ["내용증명", "소장"],
      summary: "가".repeat(CASEFILE_LIMITS.summaryChars),
      claims: ["요구합니다."],
      mySide: "claimant",
      question: "가".repeat(CASEFILE_LIMITS.questionChars),
    });
    expect(text.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
  });
});

describe("F-015 AC2 개인 이름이 새는 경로 막기 (절대 규칙 4)", () => {
  const read = (over: Partial<ReadingRaw>) => screenReading({ ...RAW, personNames: [], ...over })!;

  test("상호에 붙은 대표자·담당자 이름과 직함은 잘라 내고, 표지가 없는 이름은 비운다", () => {
    expect(orgNameOf("주식회사 한빛주택 대표이사 김민수", "business")).toBe("주식회사 한빛주택");
    expect(orgNameOf("한빛상사 대표 김민수", "business")).toBe("한빛상사");
    expect(orgNameOf("Hanbit Labs Inc. PMO 김민수", "business")).toBe("Hanbit Labs Inc.");
    expect(orgNameOf("주식회사 한빛(대표 김민수)", "business")).toBe("주식회사 한빛");
    // 모델이 개인을 사업자로 잘못 분류해도 이름은 나가지 않는다
    expect(orgNameOf("김민수", "business")).toBe("");
    expect(orgNameOf("방민수", "business")).toBe("");
    expect(orgNameOf("행복분식", "business")).toBe("");
    // 모델이 적어 준 개인 이름이 직함 없이 붙어 있어도 지운다
    expect(orgNameOf("주식회사 한빛주택 김민수", "business", ["김민수"])).toBe("주식회사 한빛주택");
    expect(orgNameOf("서울중앙지방법원", "agency")).toBe("서울중앙지방법원");
    expect(orgNameOf("서울중앙지방법원 2025가단12345", "agency")).toBe("");
    expect(orgNameOf("민사과 담당자", "agency")).toBe("");
    // "지원"·"은행"으로 끝나는 사람 이름을 기관·상호로 읽지 않는다
    for (const n of ["김지원", "이지원", "최은행", "이상회"]) {
      expect(orgNameOf(n, "agency"), n).toBe("");
      expect(orgNameOf(n, "business"), n).toBe("");
    }
    // "○○지원"은 이름 꼴과 겹쳐 떼고 법원 이름만 남긴다
    expect(orgNameOf("서울중앙지방법원 성남지원", "agency")).toBe("서울중앙지방법원");
    // 직업 이름 + 사람 이름은 상호가 아니다. 사업장 꼴만 남긴다
    for (const n of ["법무사 김민수", "공인중개사 김민수", "세무사 김민수"]) {
      expect(orgNameOf(n, "business"), n).toBe("");
    }
    expect(orgNameOf("한빛 법무사 사무소", "business")).toBe("한빛 법무사 사무소");
    // 직함 없이 붙은 이름도 모델 목록 없이 뗀다
    expect(orgNameOf("주식회사 한빛주택 김민수", "business")).toBe("주식회사 한빛주택");
    expect(orgNameOf("주식회사 한빛 주택관리", "business")).toBe("주식회사 한빛 주택관리");
  });

  test("당사자 목록에서도 같은 규칙을 탄다", () => {
    expect(
      screenParties(
        [
          {
            role: "수신인",
            side: "respondent",
            kind: "business",
            name: "주식회사 한빛주택 대표이사 김민수",
          },
          { role: "피고", side: "respondent", kind: "business", name: "김민수" },
        ],
        ["김민수"],
      ),
    ).toEqual([
      { role: "수신인", side: "respondent", kind: "business", name: "주식회사 한빛주택" },
      { role: "피고", side: "respondent", kind: "business", name: "" },
    ]);
  });

  test("호칭·관계어 없이 적힌 이름도 모델이 적어 준 목록으로 가린다", () => {
    const out = read({
      summary:
        "발신인 김민수는 수신인 박영호에게 보증금 반환을 요구했습니다. 김민수는 박영호에게 돈을 빌려주었습니다.",
      claims: ["박영호가 돈을 갚으라고 요구합니다."],
      personNames: ["김민수", "박영호"],
    });
    const all = JSON.stringify(out);
    expect(all).not.toContain("김민수");
    expect(all).not.toContain("박영호");
    expect(out.reading.summary).toMatch(/발신인 \[이름\d\]는 수신인 \[이름\d\]에게/);
    expect(out.findings.find((f) => f.type === "name")?.count).toBeGreaterThanOrEqual(5);
  });

  test("목록이 비어도 서류 역할어 바로 뒤의 이름 꼴은 가린다 — 그 자리만", () => {
    const out = read({
      summary:
        "발신인 김민수는 수신인 박영호에게 보증금 반환을 요구했습니다. 신청인 최서준은 답하지 않았습니다.",
    });
    for (const n of ["김민수", "박영호", "최서준"]) expect(out.reading.summary).not.toContain(n);
    // 역할어 뒤의 일반 낱말은 그대로 두고, 같은 글자로 시작하는 다른 낱말도 건드리지 않는다
    for (const summary of [
      "발신인 주식회사 한빛주택은 수신인 측에 계약 해지를 알렸습니다.",
      "수신인 권리를 침해했다고 적었습니다. 권리금도 돌려받지 못했습니다.",
      "신청인 변경 사실을 알리지 않았습니다.",
      "피의자 조사가 있었습니다.",
      "근로자 연차 사용을 막았습니다.",
    ]) {
      expect(read({ summary }).reading.summary, summary).toBe(summary);
    }
  });

  test("역할어 뒤에서 잡힌 이름은 다시 나와도 가리고, 성씨 목록 밖 성도 그 자리에서 잡는다", () => {
    const twice = read({
      summary: "발신인 강서준은 내용증명을 보냈습니다. 강서준은 답을 받지 못했습니다.",
    });
    expect(twice.reading.summary).toBe(
      "발신인 [이름1]은 내용증명을 보냈습니다. [이름1]은 답을 받지 못했습니다.",
    );
    const more = read({
      summary: "수신인 방영호에게 통지했습니다. 신청인 변서준은 답하지 않았습니다.",
    });
    for (const n of ["방영호", "변서준"]) expect(more.reading.summary).not.toContain(n);
    expect(orgNameOf("주식회사 한빛주택 방민수", "business")).toBe("주식회사 한빛주택");
    // 같은 자리의 법률 낱말은 이름으로 보지 않는다
    for (const summary of [
      "수신인 변제금 일부를 받았습니다.",
      "신청인 공사비 정산을 요구했습니다.",
      "발신인 위약금을 청구했습니다.",
    ]) {
      expect(read({ summary }).reading.summary, summary).toBe(summary);
    }
  });

  test("모델이 적어 준 이름은 성씨 목록 밖이어도, 표지 글자로 끝나도 가린다", () => {
    const out = read({
      summary: "방영호는 김지원에게 돈을 빌려주었습니다. 김지원은 갚지 않았습니다.",
      personNames: ["방영호", "김지원", "발신인", "대표이사 변서준", "주식회사 한빛주택"],
      claims: ["변서준이 대신 갚으라고 요구합니다."],
    });
    const all = JSON.stringify(out.reading);
    for (const n of ["방영호", "김지원", "변서준"]) expect(all).not.toContain(n);
    const bank = read({
      summary: "최은행은 박영호에게 돈을 빌려주었습니다.",
      personNames: ["최은행", "박영호"],
    });
    expect(JSON.stringify(bank.reading)).not.toMatch(/최은행|박영호/);
    // 목록에 섞인 역할어·상호는 가리지 않는다
    const kept = read({
      summary: "발신인은 주식회사 한빛주택에 통지했습니다.",
      personNames: ["발신인", "주식회사 한빛주택"],
    });
    expect(kept.reading.summary).toBe("발신인은 주식회사 한빛주택에 통지했습니다.");
  });

  test("이름 번호는 이미 쓰인 번호 다음부터 매긴다", () => {
    const { text, added } = maskMore("[이름1]은 변서준과 만났습니다. 변서준은 떠났습니다.", [
      "변서준",
    ]);
    expect(text).toBe("[이름1]은 [이름2]과 만났습니다. [이름2]은 떠났습니다.");
    expect(added).toEqual({ name: 2, other: 0 });
  });

  test("차량번호·생년월일·지번 주소 꼴도 가린다", () => {
    const { text, added } = maskMore(
      "차량 12가 3456을 몰았습니다. 1985. 3. 2.생입니다. 강남구 역삼동 123-4에 삽니다.",
      [],
    );
    expect(text).toBe("차량 [차량번호]을 몰았습니다. [생년월일]입니다. [주소]에 삽니다.");
    expect(added.other).toBe(3);
    // 날짜·금액·일반 문장은 번호 꼴로 보지 않는다 (절대 규칙 3: 숫자를 망가뜨리지 않는다)
    for (const plain of [
      "2023년 5월 10일 3000만 원을 송금했습니다.",
      "12월 2000만 원을 받았습니다.",
      "12억 5000만 원을 청구했습니다.",
      "손해배상 청구 소가 5000만 원입니다.",
      "퇴거 요구 통지가 2회 있었습니다.",
    ]) {
      expect(maskMore(plain, []).text, plain).toBe(plain);
    }
  });

  test("F-015 AC2 서면이 일부 가린 '박○○' 꼴은 성씨도 남기지 않는다 (절대 규칙 4)", () => {
    const out = read({
      summary:
        "임대인 박○○은 보증금을 돌려주지 않았습니다. 임차인은 최○○에게 내용증명을 보냈습니다. 중개인 이○영도 함께 있었습니다.",
      claims: [
        "박○○는 보증금을 돌려 달라는 요구를 받았습니다.",
        "김OO 씨와 정** 씨에게 연락했습니다.",
      ],
    });
    const all = [out.reading.summary, ...out.reading.claims].join(" ");
    for (const leak of ["박○", "최○", "이○", "김O", "정*"]) expect(all, leak).not.toContain(leak);
    expect(out.reading.summary).toContain("임대인 ○○○은");
    expect(out.reading.summary).toContain("○○○에게");
    expect(out.reading.claims[1]).toBe("○○○ 씨와 ○○○ 씨에게 연락했습니다.");
    expect(out.findings.find((f) => f.type === "name")?.count).toBeGreaterThanOrEqual(5);

    // 성과 가림 기호를 띄어 쓴 꼴(박 ㅇㅇ씨)도 개요에 성씨가 남지 않는다
    const spaced = read({
      summary:
        "임차인은 임대인 박 ㅇㅇ씨에게 보증금을 돌려 달라고 했습니다. 중개인 최ㅇㅇ은 자리에 있었습니다.",
    });
    // 판독 글은 NFKC로 맞춰져 'ㅇ'이 'ᄋ'(U+110B)로 바뀐 뒤에 가린다
    expect(spaced.reading.summary).toBe(
      "임차인은 임대인 ○○○씨에게 보증금을 돌려 달라고 했습니다. 중개인 ○○○은 자리에 있었습니다.",
    );

    // 상호·기관·지역의 ○○, 조문 자리는 그대로 둔다
    for (const plain of [
      "○○물산 주식회사가 대금을 받았습니다.",
      "○○시청에 민원을 냈습니다.",
      "○○지방법원에 소장을 냈습니다.",
      "서울○○지방법원 민사과에 물었습니다.",
      "주식회사 ○○건설이 공사를 맡았습니다.",
      "○○○은 계약서에 서명했습니다.",
    ]) {
      expect(maskMore(plain, []).text, plain).toBe(plain);
    }
    // 상호 뒤에 붙은 가린 대표자 이름은 낱말째 뗀다
    expect(orgNameOf("주식회사 한빛주택 박○○", "business")).toBe("주식회사 한빛주택");
    expect(orgNameOf("한빛주택(주) 홍*동", "business")).toBe("한빛주택(주)");
    expect(orgNameOf("주식회사 한빛주택 박○○님", "business")).toBe("주식회사 한빛주택");
    expect(orgNameOf("○○물산 주식회사", "business")).toBe("○○물산 주식회사");
  });

  test("서류 종류는 정해진 목록의 값만 받는다", () => {
    const out = read({ docTypes: ["내용증명", "김민수 차용증", "내용증명", "계약서"] });
    expect(out.reading.docTypes).toEqual(["내용증명", "계약서"]);
    expect(DOC_TYPES).toContain("기타");
  });
});

describe("F-015 AC2 사건번호·조문·판정 표현 (절대 규칙 1·2)", () => {
  const summaryOf = (summary: string) =>
    screenReading({ ...RAW, summary: `발신인은 답을 받지 못했습니다. ${summary}` })!.reading
      .summary;

  test("서류에 흔한 사건부호와 띄어 쓰지 않은 조문도 그 문장을 뺀다", () => {
    for (const s of [
      "서울중앙지방법원 2025차전12345 지급명령을 받았습니다.",
      "사건은 2025드단1234입니다.",
      "2025형제5678 사건으로 조사받았습니다.",
      "민법390조를 근거로 들었습니다.",
      "일반조건 제10조 제2항을 어겼다고 적었습니다.",
    ]) {
      expect(summaryOf(s), s).toBe("발신인은 답을 받지 못했습니다.");
    }
    // 날짜·금액은 사건부호로 보지 않는다
    expect(summaryOf("수신인은 2000만원을 2024년 3월까지 갚기로 했습니다.")).toContain(
      "2000만원을 2024년 3월까지",
    );
    expect(summaryOf("2025년 3월 15일에 계약했습니다.")).toContain(
      "2025년 3월 15일에 계약했습니다.",
    );
  });

  test("결과를 내다보거나 유불리를 말하는 문장은 뺀다", () => {
    for (const s of [
      "수신인은 사기죄로 처벌받을 수 있습니다.",
      "승소하기 어려워 보입니다.",
      "수신인에게 배상 책임이 있습니다.",
      "수신인에게 불리한 상황으로 보입니다.",
      "승소 가능성이 높습니다.",
      "형사처벌을 받게 될 것입니다.",
    ]) {
      expect(summaryOf(s), s).toBe("발신인은 답을 받지 못했습니다.");
    }
  });

  test("서류의 주장은 요구·주장 칸에 남기고, 판결 결과 같은 사실도 개요에 남긴다", () => {
    const out = screenReading({
      ...RAW,
      summary: "원고 일부 승소 판결을 받았습니다. 공사가 이루어질 것이라고 알렸습니다.",
      claims: ["수신인에게 배상 책임이 있다고 주장합니다.", "손해배상 책임을 질 것을 요구합니다."],
    })!;
    expect(out.reading.summary).toBe(
      "원고 일부 승소 판결을 받았습니다. 공사가 이루어질 것이라고 알렸습니다.",
    );
    expect(out.reading.claims).toHaveLength(2);
    expect(out.dropped).toBe(0);
  });

  test("역할 값에 가해·피해 판정으로 읽힐 말이 없다", () => {
    expect(PARTY_ROLES).not.toContain("피해자");
    expect(PARTY_ROLES).not.toContain("가해자");
    for (const r of ["피의자", "피고인", "고발인", "피진정인"]) expect(PARTY_ROLES).toContain(r);
  });
});
