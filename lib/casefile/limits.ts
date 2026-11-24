// 서류 분석 (F-015, DEC-052) — 브라우저와 서버가 함께 쓰는 한도·보기 값. 다른 모듈을 끌어오지 않는다(브라우저 묶음에 들어간다).

/**
 * 올릴 수 있는 서류 사진·문서 수·크기. 배포 서버의 요청 본문 한도(약 4.5MB)에 맞춘다.
 * 2026-11-24 사용자 요청: 사진 30장까지, 문서(PDF·한글·워드·파워포인트·엑셀·텍스트)도 읽는다.
 * 사진이 많으면 보내기 직전에 전체 한도 안으로 다시 줄인다(lib/client/casefile fitToBudget).
 */
export const CASEFILE_LIMITS = {
  /** 사진·문서를 합친 파일 수 */
  maxImages: 30,
  /** 사진 한 장의 base64 글자 수 (약 600KB) */
  maxImageChars: 820_000,
  /** PDF 한 개의 base64 글자 수 (약 900KB 파일). PDF 쪽 수 합계는 maxPdfPages까지 */
  maxPdfChars: 1_200_000,
  /** PDF 쪽 수 합계 (쪽마다 글 + 그림 토큰이 들어가 장문 구간을 넘지 않게) */
  maxPdfPages: 20,
  /** 사진·PDF 전체의 base64 글자 수 */
  maxTotalChars: 4_000_000,
  /** 문서에서 꺼낸 글(한글·워드·파워포인트·엑셀·텍스트) 전체 글자 수 */
  maxTextChars: 20_000,
  /** 함께 적는 질문 길이 */
  questionChars: 500,
  /** 사건 개요 길이 (질문 한 건 10,000자 안에 서류 종류·요구·질문과 함께 들어가야 한다, 2026-11-25 1,100 → 3,000자) */
  summaryChars: 3_000,
  /** 브라우저에서 줄일 때의 긴 변 길이(픽셀) — 큰 값부터 시도한다 */
  longEdges: [2000, 1568, 1200],
} as const;

export const CASEFILE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type CaseFileMediaType = (typeof CASEFILE_MEDIA_TYPES)[number];

/** 글을 꺼내 보내는 문서 확장자 (브라우저에서 글만 꺼내고, 서버가 개인정보를 가린 뒤 모델에 보낸다) */
export const TEXT_DOC_EXTENSIONS = [
  "hwp",
  "hwpx",
  "docx",
  "pptx",
  "xlsx",
  "txt",
  "md",
  "csv",
] as const;
/** 파일 고르기 창의 accept 값 */
export const ATTACH_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  ".pdf",
  ...TEXT_DOC_EXTENSIONS.map((e) => `.${e}`),
].join(",");
/** 문서에서 꺼낸 글 한 개 */
export type CaseText = { name: string; text: string };

/**
 * 서류 종류. 자유 문구로 받으면 이름이 섞일 수 있어 정해진 값만 쓴다.
 */
export const DOC_TYPES = [
  "내용증명",
  "통지서",
  "소장",
  "답변서",
  "준비서면",
  "고소장",
  "고발장",
  "진정서",
  "계약서",
  "합의서",
  "차용증",
  "지급명령",
  "판결문",
  "결정문",
  "공문",
  "거래 내역",
  "메신저 대화",
  "문자",
  "이메일",
  "기타",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

/**
 * 서류에 적힌 절차상 역할. 서류에 쓰인 자리만 옮긴다 — 누가 잘못했는지를 AI가 정하지 않는다 (절대 규칙 2).
 * "피해자"·"가해자"는 값으로 두지 않는다: AI가 고른 그 말이 상호 옆에 붙으면 판정처럼 읽힌다. 방향은 side가 보인다.
 */
export const PARTY_ROLES = [
  "발신인",
  "수신인",
  "원고",
  "피고",
  "고소인",
  "피고소인",
  "고발인",
  "피고발인",
  "진정인",
  "피진정인",
  "피의자",
  "피고인",
  "신청인",
  "피신청인",
  "채권자",
  "채무자",
  "임대인",
  "임차인",
  "사용자",
  "근로자",
  "기타",
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

/** 서류에서의 자리: 요구·청구를 하는 쪽 / 받는 쪽 / 그 밖(기관·제3자). 옳고 그름이 아니라 서류의 방향이다 */
export const PARTY_SIDES = ["claimant", "respondent", "other"] as const;
export type PartySide = (typeof PARTY_SIDES)[number];
export const SIDE_LABEL: Record<PartySide, string> = {
  claimant: "요구·청구하는 쪽",
  respondent: "요구·청구를 받는 쪽",
  other: "그 밖 (기관·제3자)",
};

/** 개인은 이름을 받지도 보이지도 않는다. 법인·사업자·기관만 이름을 남긴다 */
export const PARTY_KINDS = ["business", "agency", "person"] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];
export const KIND_LABEL: Record<PartyKind, string> = {
  business: "법인·사업자",
  agency: "기관",
  person: "개인",
};

export type CaseParty = {
  role: PartyRole;
  side: PartySide;
  kind: PartyKind;
  /** 법인·사업자·기관 이름. 개인은 언제나 빈 문자열 */
  name: string;
};

export type CaseReading = {
  docTypes: DocType[];
  /** 개인정보를 가린 사건 개요 */
  summary: string;
  /** 서류가 요구하거나 주장하는 것 */
  claims: string[];
  parties: CaseParty[];
};

/** 질문자가 서류에서 어느 쪽인지 — 사용자가 직접 고른다 */
export type MySide = "claimant" | "respondent" | "unknown";
export const MY_SIDE_LABEL: Record<MySide, string> = {
  claimant: "요구·청구하는 쪽이에요",
  respondent: "요구·청구를 받은 쪽이에요",
  unknown: "잘 모르겠어요",
};

/**
 * 확인한 사건 개요와 질문을 질문 한 건의 문장으로 합친다. 서버는 이 문장을 다시 가린 뒤 저장한다 (DEC-006).
 * 모델을 쓰지 않는 단순 이어 붙이기다.
 */
export function composeCaseText(input: {
  docTypes: string[];
  summary: string;
  claims: string[];
  mySide: MySide;
  question: string;
}): string {
  const lines = [
    `서류 분석 요청. 서류 종류: ${input.docTypes.join(", ") || "적지 않음"}`,
    `사건 개요: ${input.summary.trim()}`,
  ];
  if (input.claims.length > 0) lines.push(`서류의 요구·주장: ${input.claims.join(" / ")}`);
  if (input.mySide !== "unknown") {
    lines.push(
      `질문자의 자리: ${input.mySide === "claimant" ? "요구·청구하는 쪽" : "요구·청구를 받은 쪽"}`,
    );
  }
  lines.push(
    `질문: ${input.question.trim() || "지금 상황의 쟁점이 무엇이고 어떤 절차로 진행할 수 있는지 알고 싶어요."}`,
  );
  return lines.join("\n");
}
