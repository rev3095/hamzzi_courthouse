// @vitest-environment node
// DEC-025 단계별 공식 서식 설문·내보내기 — 입력값이 문서·DOCX·HWPX·PDF에 그대로 들어가고, 숫자를 지어내지 않는다.
// 무료 로컬 검사만 (LLM 없음). 실명 대신 가상 이름을 쓴다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { read as readHwpx } from "hwpx-js";
import { PDFDocument } from "pdf-lib";
import { describe, expect, test } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { ApiError } from "@/lib/api/errors";
import { buildFile } from "@/lib/documents/export";
import { documentXml, toDocx, xmlEscape } from "@/lib/documents/export/docx";
import { hwpxDocument, toHwpx } from "@/lib/documents/export/hwpx";
import { wrapLine } from "@/lib/documents/export/pdf";
import { crc32 } from "@/lib/documents/export/zip";
import { formatDate, formatWon } from "@/lib/documents/fill";
import {
  CHECK_NOTICE,
  DOCUMENT_KINDS,
  DOCUMENT_SPECS,
  fillDocument,
  initialValues,
  invalidFields,
  parseDocumentInput,
} from "@/lib/documents/policy";
import { shortcutOf } from "@/lib/procedure/policy";
import type { DocumentKind } from "@/lib/procedure/steps";
import { TRACKS } from "@/lib/procedure/steps";

const FULL: Record<DocumentKind, Record<string, string>> = {
  "demand-letter": {
    subject: "임대차보증금 반환 요청",
    senderName: "김햄찌",
    senderAddress: "해바라기시 씨앗구 볍씨로 7, 101동 202호",
    recipientName: "이도토리",
    recipientAddress: "도토리시 참나무구 밤길 3",
    facts: "2025년 3월 1일 임대차계약을 맺었습니다.\n보증금 45,000,000원을 보냈습니다.",
    demand: "보증금 45,000,000원을 돌려주시기 바랍니다.",
    deadline: "이 글을 받으신 날부터 14일 이내",
    writtenOn: "2026-11-17",
  },
  "lease-registration": {
    applicantName: "김햄찌",
    applicantAddress: "해바라기시 씨앗구 볍씨로 7, 101동 202호",
    applicantPhone: "010-0000-1234",
    landlordName: "이도토리",
    landlordAddress: "도토리시 참나무구 밤길 3",
    propertyAddress: "해바라기시 씨앗구 볍씨로 7\n해바라기아파트 101동 202호",
    leaseScope: "위 건물 중 202호 전부",
    contractDate: "2024-02-10",
    deposit: "45,000,000",
    rent: "350000",
    moveInDate: "2024-03-02",
    residentDate: "2024-03-04",
    fixedDate: "2024-03-05",
    endReason: "notice",
    endDate: "2026-03-01",
    unpaid: "40000000",
    extraReason: "2026년 1월 9일 문자로 계약 종료와 보증금 반환을 요청했습니다.",
    attachments: "registry,resident,contract,termination",
    court: "해바라기지방법원",
    writtenOn: "2026-11-17",
  },
  "payment-order": {
    creditorName: "김햄찌",
    creditorAddress: "해바라기시 씨앗구 볍씨로 7",
    creditorPhone: "010-0000-1234",
    debtorName: "이도토리",
    debtorAddress: "도토리시 참나무구 밤길 3",
    debtorPhone: "",
    claimAmount: "3000000",
    interestRate: "5",
    interestFrom: "date",
    interestDate: "2026-04-01",
    feeDelivery: "62400",
    feeStamp: "1500",
    claimCause: "채권자는 2025년 5월 2일 채무자에게 3,000,000원을 빌려주었습니다.",
    attachments: "contract,transfer",
    attachmentsExtra: "차용증 사진",
    court: "도토리지방법원",
    writtenOn: "",
  },
  complaint: {
    caseName: "임대차보증금 반환 청구의 소",
    plaintiffName: "김햄찌",
    plaintiffAddress: "해바라기시 씨앗구 볍씨로 7",
    plaintiffPhone: "",
    defendantName: "이도토리",
    defendantAddress: "도토리시 참나무구 밤길 3",
    defendantPhone: "",
    claimAmount: "40000000",
    interestRate: "12",
    interestFrom: "served",
    provisional: "yes",
    claimCause: "1. 원고는 2024년 2월 10일 피고와 임대차계약을 맺었습니다.",
    evidence: "갑 제1호증 임대차계약서\n갑 제2호증 계좌 이체 내역",
    attachments: "fee,proof,copy",
    court: "도토리지방법원",
    writtenOn: "2026-11-17",
  },
  "criminal-complaint": {
    complainantName: "김햄찌",
    complainantAddress: "해바라기시 씨앗구 볍씨로 7",
    complainantPhone: "010-0000-1234",
    accusedName: "",
    accusedAddress: "",
    accusedPhone: "",
    accusedSite: "도토리마켓",
    accusedId: "acorn77",
    accusedAccount: "다람은행 333-22-1111",
    fraudType: "trade",
    incidentDate: "2026-09-03",
    incidentPlace: "도토리마켓 앱 채팅",
    damageDetail:
      "2026년 9월 3일 중고 노트북을 사기로 하고 850,000원을 보냈습니다.\n그 뒤 물건을 받지 못했고 연락이 끊겼습니다.",
    damageAmount: "850000",
    punish: "yes",
    evidence: "이체 내역\n대화 캡처",
    duplicate: "no",
    relatedCriminal: "no",
    relatedCivil: "no",
    pledge: "agree",
    policeStation: "해바라기경찰서",
    writtenOn: "2026-11-17",
  },
  "compensation-order": {
    caseNumber: "2026고단1234",
    caseName: "사기",
    court: "해바라기지방법원",
    applicantName: "김햄찌",
    applicantAddress: "해바라기시 씨앗구 볍씨로 7",
    applicantPhone: "010-0000-1234",
    defendantName: "이도토리",
    defendantAddress: "도토리시 참나무구 밤길 3",
    claimAmount: "850000",
    claimContent: "피고인은 2026년 9월 3일 신청인을 속여 850,000원을 받아 갔습니다.",
    attachments: "계좌 이체 내역",
    writtenOn: "2026-11-17",
  },
  "wage-petition": {
    petitionerName: "김햄찌",
    petitionerAddress: "해바라기시 씨앗구 볍씨로 7",
    petitionerPhone: "010-0000-1234",
    companyName: "도토리식당",
    employerName: "이도토리",
    companyAddress: "도토리시 참나무구 밤길 3",
    employerPhone: "",
    startDate: "2025-03-02",
    stillWorking: "no",
    endDate: "2026-08-31",
    jobDuty: "주방 보조",
    contractType: "written",
    payday: "매월 10일",
    unpaidWage: "4200000",
    unpaidSeverance: "",
    petitionDetail: "2026년 7월분과 8월분 임금을 받지 못했습니다.",
    evidence: "근로계약서\n급여 입금 내역",
    office: "도토리지방고용노동청",
    writtenOn: "2026-11-17",
  },
  "wage-advance": {
    claimantName: "김햄찌",
    claimantAddress: "해바라기시 씨앗구 볍씨로 7",
    claimantPhone: "010-0000-1234",
    claimantEmail: "",
    workFrom: "2025-03-02",
    workTo: "2026-08-31",
    claimantStatus: "retired",
    claimBasis: "certificate",
    totalUnpaid: "4200000",
    alreadyPaid: "",
    pensionPending: "no",
    insurancePending: "no",
    unpaidRecentWage: "4200000",
    unpaidRecentSeverance: "",
    notifyBy: "sms",
    companyName: "도토리식당",
    employerName: "이도토리",
    companyAddress: "도토리시 참나무구 밤길 3",
    office: "도토리지역본부",
    writtenOn: "",
  },
  "dismissal-remedy": {
    workerName: "김햄찌",
    workerAddress: "해바라기시 씨앗구 볍씨로 7",
    workerPhone: "",
    companyName: "도토리상사",
    employerName: "이도토리",
    companyAddress: "도토리시 참나무구 밤길 3",
    workplace: "",
    hireDate: "2024-01-08",
    dismissalDate: "2026-10-31",
    noticeDate: "2026-10-30",
    remedyAim: "reinstate",
    reason: "2026년 10월 30일 대표가 말로 해고를 알렸고 해고 사유를 서면으로 받지 못했습니다.",
    commission: "도토리지방노동위원회",
    writtenOn: "2026-11-17",
  },
  "dismissal-review": {
    applicantName: "김햄찌",
    applicantAddress: "해바라기시 씨앗구 볍씨로 7",
    applicantPhone: "",
    respondentName: "이도토리",
    respondentCompany: "도토리상사",
    respondentAddress: "도토리시 참나무구 밤길 3",
    firstCommission: "도토리지방노동위원회",
    firstCaseNumber: "2026부해777",
    decisionReceived: "2027-01-05",
    reviewAim: "초심 판정을 취소하고, 초심에서 구한 구제신청을 인정하는 판정을 구합니다.",
    reviewReason:
      "초심은 해고 통지가 서면으로 이루어졌다고 보았으나 서면 통지를 받은 사실이 없습니다.",
    writtenOn: "",
  },
};

const digits = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/(\d),(?=\d{3})/g, "$1")
    .match(/\d+/g) ?? [];

/** 문서의 숫자 중 사용자 입력에 없는 것 (목록 번호·'제1항'·'1항'은 구조 번호라 뺀다) */
function strayNumbers(text: string, input: Record<string, string>): string[] {
  const allowed = new Set(
    Object.values(input).flatMap((v) => [
      ...digits(v),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(v) ? digits(formatDate(v)) : []),
    ]),
  );
  const structural = text
    .split("\n")
    // 목록 번호·원문자(①…)·'제1항'·조문 인용(형법 제156조)은 구조 번호·근거 인용이라 뺀다
    .map((l) =>
      l
        .replace(/^\s*\d+\.\s/, "")
        .replace(/[①-⑳]/g, "")
        .replace(/제\d+(조|항|호)(의\d+)?/g, "")
        .replace(/\b\d+항/g, "")
        // 법령 서식 문구 그대로 (간이대지급금 ⑤ 칸)
        .replace(/최종 3개월분|마지막 3개월분|최종 3년간/g, ""),
    )
    .join("\n");
  return digits(structural).filter((d) => !allowed.has(d));
}

describe("DEC-025 서식 정의 (공식 서식 기준)", () => {
  test.each(DOCUMENT_KINDS)(
    "%s: 모든 칸이 설문 페이지에 한 번씩, 페이지마다 한두~세 칸",
    (kind) => {
      const spec = DOCUMENT_SPECS[kind];
      const inPages = spec.pages.flatMap((p) => p.fields);
      expect(new Set(inPages).size).toBe(inPages.length);
      expect([...inPages].sort()).toEqual(spec.fields.map((f) => f.key).sort());
      for (const p of spec.pages) expect(p.fields.length).toBeLessThanOrEqual(3);
    },
  );

  test.each(DOCUMENT_KINDS)(
    "%s: 공식 서식 이름·출처·근거 조문이 있고 링크는 공공기관 https",
    (kind) => {
      const spec = DOCUMENT_SPECS[kind];
      expect(spec.officialForms.length).toBeGreaterThan(0);
      expect(spec.basis.length).toBeGreaterThan(0);
      for (const f of spec.officialForms) {
        // 공공기관 도메인(go.kr·or.kr의 법원·경찰·노동·법률구조공단·금융감독원·법제처)만
        expect(f.url).toMatch(
          /^https:\/\/(www\.)?(scourt\.go\.kr|epost\.go\.kr|minwon24\.police\.go\.kr|hldcc\.or\.kr|law\.go\.kr|moel\.go\.kr|labor\.moel\.go\.kr|nlrc\.go\.kr|fss\.or\.kr|comwel\.or\.kr)(\/|$)/,
        );
        expect(f.source).toMatch(
          /법원|우정사업본부|경찰청|법제처|대한법률구조공단|고용노동부|노동위원회|금융감독원|근로복지공단/,
        );
      }
    },
  );

  test("임차권등기명령·지급명령 단계가 해당 서식으로 연결된다 (임대차·계약금·민사 타임라인)", () => {
    const lease = TRACKS.lease_deposit.steps;
    expect(lease.find((s) => s.key === "lease_registration")?.document).toBe("lease-registration");
    for (const t of ["lease_deposit", "contract_deposit", "money"] as const) {
      expect(TRACKS[t].steps.find((s) => s.key === "order")?.document).toBe("payment-order");
      expect(TRACKS[t].steps.find((s) => s.key === "notice")?.document).toBe("demand-letter");
      expect(TRACKS[t].steps.find((s) => s.key === "suit")?.document).toBe("complaint");
    }
  });

  test("절대 규칙 2 제출 전 확인 문구에 단정·승패 표현이 없다", () => {
    expect(isAssertive(CHECK_NOTICE)).toBe(false);
    expect(CHECK_NOTICE).toMatch(/법원|전문가|변호사/);
  });

  test("F-007 주민등록번호 칸을 묻지 않는다", () => {
    for (const kind of DOCUMENT_KINDS)
      for (const f of DOCUMENT_SPECS[kind].fields) expect(f.label).not.toMatch(/주민등록번호/);
  });
});

describe("DEC-025 설문 검증", () => {
  test("페이지 단위 검사: 빈 칸·잘못된 금액·날짜만 이름으로 알린다 (값은 넣지 않음)", () => {
    const v = { deposit: "사천만", contractDate: "2026-02-30", rent: "" };
    expect(invalidFields("lease-registration", ["contractDate", "deposit", "rent"], v)).toEqual([
      "contractDate",
      "deposit",
    ]);
    expect(
      invalidFields("lease-registration", ["contractDate", "deposit", "rent"], {
        contractDate: "2024-02-29",
        deposit: "45,000,000원",
      }),
    ).toEqual([]);
  });

  test("이율을 적었을 때만 시작일을 묻고, '직접 정한 날'일 때만 날짜를 묻는다", () => {
    const keys = ["interestRate", "interestFrom", "interestDate"];
    expect(invalidFields("payment-order", keys, {})).toEqual([]);
    expect(invalidFields("payment-order", keys, { interestRate: "5" })).toEqual(["interestFrom"]);
    expect(
      invalidFields("payment-order", keys, { interestRate: "5", interestFrom: "date" }),
    ).toEqual(["interestDate"]);
    expect(invalidFields("payment-order", keys, { interestRate: "백" })).toEqual([
      "interestRate",
      "interestFrom",
    ]);
  });

  test("체크 목록은 정해진 값만, 기본 선택은 공식 서식 첨부서류", () => {
    expect(initialValues("lease-registration").attachments).toBe(
      "registry,resident,contract,termination",
    );
    expect(() =>
      parseDocumentInput("lease-registration", {
        ...FULL["lease-registration"],
        attachments: "registry,evil",
      }),
    ).toThrow(ApiError);
  });
});

describe("DEC-025 서식 채우기 — 입력값이 정확히 들어가고 숫자를 지어내지 않는다 (절대 규칙 3)", () => {
  test.each(DOCUMENT_KINDS)("%s", (kind) => {
    const input = FULL[kind];
    const doc = fillDocument(kind, parseDocumentInput(kind, input));
    for (const f of DOCUMENT_SPECS[kind].fields) {
      const v = input[f.key];
      if (!v || f.type === "choice" || f.type === "checks") continue;
      if (f.type === "money") expect(doc.text, f.key).toContain(formatWon(v.replace(/\D/g, "")));
      else if (f.type === "date") expect(doc.text, f.key).toContain(formatDate(v));
      else
        for (const line of v.split("\n"))
          expect(doc.text, f.key).toContain(line.replace(/^\d+\.\s*/, ""));
    }
    // 지급명령 독촉절차비용 합계만 코드가 더한다 (사용자가 적은 두 금액의 덧셈, 아래 테스트)
    const sum =
      kind === "payment-order" ? String(Number(input.feeDelivery) + Number(input.feeStamp)) : "";
    expect(
      strayNumbers(doc.text, input).filter((d) => d !== sum),
      kind,
    ).toEqual([]);
    expect(doc.text).not.toMatch(/승소|패소|반드시|무조건|100%/);
  });

  test("선택 칸을 비우면 이자·비용 문장을 만들지 않고 빈칸으로 둔다", () => {
    const input = {
      ...FULL["payment-order"],
      interestRate: "",
      feeDelivery: "",
      feeStamp: "",
    };
    const { text } = fillDocument("payment-order", parseDocumentInput("payment-order", input));
    expect(text).not.toMatch(/%|비율로 계산/);
    expect(text).toMatch(/독촉절차비용 {2}금 \s+원/);
    expect(strayNumbers(text, input)).toEqual([]);
  });

  test("지급명령 독촉절차비용 합계는 사용자가 적은 두 금액의 덧셈만", () => {
    const { text } = fillDocument(
      "payment-order",
      parseDocumentInput("payment-order", FULL["payment-order"]),
    );
    expect(text).toContain("금 63,900원 (내역: 송달료 62,400원, 인지대 1,500원)");
    expect(text).toContain("2026. 4. 1.부터 다 갚는 날까지 연 5%");
  });

  test("임차권등기명령 신청취지는 법원 서식 순서(계약일·보증금·주민등록일·범위·점유·확정일자)", () => {
    const { text } = fillDocument(
      "lease-registration",
      parseDocumentInput("lease-registration", FULL["lease-registration"]),
    );
    expect(text).toMatch(
      /1\. 임대차계약일자 : 2024\. 2\. 10\.\n2\. 임차보증금액 : 금 45,000,000원, {2}차임 : 금 350,000원\n3\. 주민등록일자 : 2024\. 3\. 4\.\n4\. 임차범위 : 위 건물 중 202호 전부\n5\. 점유개시일자 : 2024\. 3\. 2\.\n6\. 확정일자 : 2024\. 3\. 5\./,
    );
    expect(text).toContain("해지 통지에 따라 끝났습니다");
    expect(text).toContain("(주민등록번호:");
    expect(text).toContain("해바라기지방법원 귀중");
  });

  test("소장 청구취지: 가집행 문장은 고를 때만", () => {
    const off = fillDocument(
      "complaint",
      parseDocumentInput("complaint", { ...FULL.complaint, provisional: "no" }),
    ).text;
    expect(off).not.toContain("가집행");
    const on = fillDocument("complaint", parseDocumentInput("complaint", FULL.complaint)).text;
    expect(on).toContain("3. 제1항은 가집행할 수 있다.");
    expect(on).toContain("소장 부본 송달 다음 날부터 다 갚는 날까지 연 12%");
  });
});

describe("DEC-025 내보내기 (브라우저 안에서 만드는 파일)", () => {
  const doc = fillDocument(
    "lease-registration",
    parseDocumentInput("lease-registration", FULL["lease-registration"]),
  );

  test("ZIP CRC32 표준값", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  test("DOCX: ZIP 구조와 본문에 입력값이 들어간다 (XML 이스케이프)", () => {
    const bytes = toDocx(doc.blocks);
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe("PK");
    const raw = new TextDecoder().decode(bytes);
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/_rels/document.xml.rels",
    ])
      expect(raw).toContain(part);
    expect(raw).toContain("김햄찌");
    expect(raw).toContain("45,000,000");
    expect(xmlEscape('<a & "b">\u0001')).toBe("&lt;a &amp; &quot;b&quot;&gt;");
    expect(documentXml([{ kind: "text", text: "A&B<" }])).toContain("A&amp;B&lt;");
  });

  test("HWPX: 다시 읽으면 같은 문단, 제목은 가운데·서명줄은 오른쪽 정렬", () => {
    const back = readHwpx(toHwpx(doc.blocks));
    const texts = back.sections[0].paragraphs.map((p) =>
      p.runs.map((r) => (r.t === "text" ? r.text : "")).join(""),
    );
    expect(texts).toEqual(doc.blocks.map((b) => b.text));
    const model = hwpxDocument(doc.blocks);
    const alignOf = (i: number) =>
      model.head.paraProperties.find((pp) => pp.id === model.sections[0].paragraphs[i].paraPrIDRef)
        ?.alignment;
    expect(alignOf(0)).toBe("CENTER");
    expect(alignOf(doc.blocks.findIndex((b) => b.kind === "right"))).toBe("RIGHT");
  });

  test("PDF: 한글 글꼴을 넣은 A4 PDF, 제목만 메타데이터에 넣는다 (이름 없음)", async () => {
    const fonts = {
      regular: new Uint8Array(readFileSync(join("public/fonts/NanumGothic-Regular.ttf"))),
      bold: new Uint8Array(readFileSync(join("public/fonts/NanumGothic-Bold.ttf"))),
    };
    const file = await buildFile(
      "pdf",
      doc.blocks,
      { title: doc.title, basename: doc.basename },
      async () => fonts,
    );
    expect(file.filename).toBe("주택임차권등기명령신청서.pdf");
    expect(new TextDecoder().decode(file.data.slice(0, 5))).toBe("%PDF-");
    expect(file.data.length).toBeLessThan(1_500_000);
    const pdf = await PDFDocument.load(file.data);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toBe("주택임차권등기명령 신청서");
    expect(pdf.getAuthor()).toBeUndefined();
  }, 20_000);

  test("PDF 줄 나눔: 띄어쓰기에서 먼저, 안 되면 글자 단위", () => {
    const w = (s: string) => s.length;
    expect(wrapLine("가나다 라마바 사아", 7, w)).toEqual(["가나다 라마바", "사아"]);
    expect(wrapLine("가나다라마바사아자", 4, w)).toEqual(["가나다라", "마바사아", "자"]);
    expect(wrapLine("", 4, w)).toEqual([""]);
  });

  test("형식별 파일 이름·형식", async () => {
    const meta = { title: doc.title, basename: doc.basename };
    const none = async () => {
      throw new Error("no fonts");
    };
    expect((await buildFile("docx", doc.blocks, meta, none)).filename).toBe(
      "주택임차권등기명령신청서.docx",
    );
    expect((await buildFile("hwpx", doc.blocks, meta, none)).mime).toBe("application/hwp+zip");
  });
});

describe("DEC-025 2차 사기 서식", () => {
  test("고소장: 경찰 서식 진실확약 문구를 그대로 넣고, 체크해야만 완성된다", () => {
    const input = FULL["criminal-complaint"];
    const { text } = fillDocument(
      "criminal-complaint",
      parseDocumentInput("criminal-complaint", input),
    );
    expect(text).toContain(
      "만일 허위사실을 고소하였을 때에는 형법 제156조 무고죄로 처벌받을 것임을 서약합니다.",
    );
    expect(text).toContain("① 사기 수법 : 일반 매매");
    expect(text).toContain("⑤ 피해 금액 : 850,000원");
    expect(text).toContain("■ 피고소인에 대한 처벌을 원함");
    expect(text).toContain("해바라기경찰서 귀중");
    expect(invalidFields("criminal-complaint", ["pledge"], { pledge: "" })).toEqual(["pledge"]);
  });

  test("고소장: 피고소인 정보를 몰라도 되고, 피해 금액을 비우면 '모름'", () => {
    const { text } = fillDocument(
      "criminal-complaint",
      parseDocumentInput("criminal-complaint", {
        ...FULL["criminal-complaint"],
        accusedSite: "",
        accusedId: "",
        accusedAccount: "",
        damageAmount: "",
        incidentDate: "",
      }),
    );
    expect(text).toContain("⑤ 피해 금액 : 모름");
    expect(text).toContain("② 피해를 당한 날짜 : \n");
  });

  test("배상명령: 특례법 제26조 기재사항(사건·신청인·피고인·배상 대상·금액)이 모두 들어간다", () => {
    const { text } = fillDocument(
      "compensation-order",
      parseDocumentInput("compensation-order", FULL["compensation-order"]),
    );
    expect(text).toContain("사    건  2026고단1234  사기");
    expect(text).toContain("1. 배상을 청구하는 금액   금 850,000원");
    expect(text).toContain("피 고 인  이도토리");
    expect(text).toContain("해바라기지방법원 귀중");
    expect(text).not.toContain("주민등록번호");
  });

  test("사기 타임라인: 고소·신고 바로 가기는 공식 신고 창구가 먼저, 서식은 단계에서 연다", () => {
    const report = TRACKS.fraud.steps.find((s) => s.key === "report")!;
    expect(report.document).toBe("criminal-complaint");
    expect(shortcutOf(report)?.kind).toBe("official");
    expect(TRACKS.fraud.steps.find((s) => s.key === "compensation_order")?.document).toBe(
      "compensation-order",
    );
  });
});

describe("DEC-025 정의 일관성", () => {
  test.each(DOCUMENT_KINDS)("%s: 선택지 값은 칸 길이 안, 기본값은 선택지 안", (kind) => {
    for (const f of DOCUMENT_SPECS[kind].fields) {
      for (const o of f.options ?? []) expect(o.value.length, `${f.key}:${o.value}`).toBeLessThanOrEqual(f.max);
      if (f.type === "choice" && f.defaultValue)
        expect(f.options?.map((o) => o.value), f.key).toContain(f.defaultValue);
    }
  });
});

describe("DEC-025 3차 노동 서식", () => {
  test("간이대지급금: ⑥ 지급받을 대지급금·⑧ 계좌는 빈칸, 법령 서식 청구 문장 그대로", () => {
    const { text } = fillDocument(
      "wage-advance",
      parseDocumentInput("wage-advance", FULL["wage-advance"]),
    );
    expect(text).toContain("⑥ 지급받아야 할 대지급금              원");
    expect(text).toContain("⑧ 입금의뢰  입금은행:              예금주:              계좌번호:");
    expect(text).toContain("[✔]퇴직자 대지급금 청구  [ ]재직자 대지급금 청구");
    expect(text).toContain("[ ]판결등에 따른 청구  [✔]체불 임금등ㆍ사업주 확인서에 따른 청구");
    expect(text).toContain("③ 지급받지 못한 임금등의 총 확정금액  4,200,000원");
    expect(text).toContain("위와 같이 대지급금의 지급을 청구합니다.");
    expect(text).toContain("근로복지공단 도토리지역본부장 귀하");
  });

  test("구제신청서: 노동위원회규칙 제39조 기재사항(근로자·사업주·취지·이유·해고통지서 수령일)", () => {
    const { text } = fillDocument(
      "dismissal-remedy",
      parseDocumentInput("dismissal-remedy", FULL["dismissal-remedy"]),
    );
    for (const s of ["신청인 (근로자)", "피신청인 (사용자)", "신 청 취 지", "신 청 이 유"])
      expect(text).toContain(s);
    expect(text).toContain("해고통지서 수령일  2026. 10. 30.");
    expect(text).toContain("라는 구제명령을 구합니다.");
  });

  test("진정서: 재직 중이면 퇴사일을 묻지 않는다", () => {
    expect(
      invalidFields("wage-petition", ["startDate", "stillWorking", "endDate"], {
        startDate: "2025-03-02",
        stillWorking: "yes",
      }),
    ).toEqual([]);
    const { text } = fillDocument(
      "wage-petition",
      parseDocumentInput("wage-petition", { ...FULL["wage-petition"], stillWorking: "yes", endDate: "" }),
    );
    expect(text).toContain("~ 현재 (재직 중)");
  });

  test("노동 타임라인 단계에 서식이 연결되고, 공식 창구 바로 가기는 그대로", () => {
    const wage = TRACKS.wage.steps;
    expect(wage.find((s) => s.key === "complaint")?.document).toBe("wage-petition");
    expect(shortcutOf(wage.find((s) => s.key === "complaint")!)?.kind).toBe("official");
    expect(wage.find((s) => s.key === "recovery")?.document).toBe("wage-advance");
    const dis = TRACKS.dismissal.steps;
    expect(dis.find((s) => s.key === "remedy")?.document).toBe("dismissal-remedy");
    expect(dis.find((s) => s.key === "review")?.document).toBe("dismissal-review");
  });
});
