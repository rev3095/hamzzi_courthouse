// 자료 첨부 (F-017, DEC-058) — 브라우저와 서버가 함께 쓰는 한도·보기 값. 다른 모듈을 끌어오지 않는다(브라우저 묶음에 들어간다).
// 일반 질문·이어 묻기·DeepSearch·검색에 붙인 사진(증거·대화 캡처·현장 사진 등)을 Haiku 비전 1회로 읽어
// "어떤 자료인지 · 무엇이 적혀 있는지 · 읽지 못한 곳"으로 정리한다. 법률 판단·증거 가치 평가는 하지 않는다 (절대 규칙 2).

/**
 * 자료 종류. 자유 문구로 받으면 이름이 섞일 수 있어 정해진 값만 쓴다.
 * 서류 분석(F-015)의 서류 종류보다 넓다 — 증거 사진·화면 캡처를 함께 다룬다.
 */
export const MATERIAL_KINDS = [
  "메신저 대화",
  "문자",
  "이메일",
  "계약서",
  "영수증·거래 내역",
  "공문·통지서",
  "법원·수사기관 서류",
  "현장 사진",
  "물건·상태 사진",
  "화면 캡처",
  "기타 서류",
  "기타",
] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export const isMaterialKind = (v: unknown): v is MaterialKind =>
  typeof v === "string" && (MATERIAL_KINDS as readonly string[]).includes(v);

export const MATERIAL_LIMITS = {
  /** 파일 수·크기는 서류 분석(CASEFILE_LIMITS)과 같다 — 같은 붙이기 버튼과 같은 판독 검증을 쓴다. 자료 정리도 파일마다 하나다 */
  maxItems: 30,
  /** 자료 한 장의 내용 요약 길이 */
  summaryChars: 240,
  /** 사진에 적힌 내용(날짜·금액·문구) 줄 수와 한 줄 길이 */
  details: 5,
  detailChars: 90,
  /** 읽지 못했거나 사진에 보이지 않는 것 */
  gaps: 3,
  gapChars: 90,
  /** 검색 화면에서 고를 수 있는 검색어 후보 */
  queries: 3,
  /** 질문과 함께 저장하는 자료 전체 글자 수 (모델 입력이 단계 상한 안에 들도록) */
  totalChars: 3_000,
  /** 전체 글자 수를 넘을 때 뒤 자료부터 줄이는 요약 길이 */
  shortSummaryChars: 60,
} as const;

/** 사진 한 장을 읽은 결과 (개인정보를 가린 것) */
export type MaterialReading = {
  kind: MaterialKind;
  /** 무엇이 찍힌 자료인지 한두 문장 */
  summary: string;
  /** 사진에 적힌 날짜·금액·문구 (적힌 그대로) */
  details: string[];
  /** 글자가 흐리거나 사진에 보이지 않아 확인하지 못한 것 */
  gaps: string[];
};

/** 질문을 비워 두고 자료만 보냈을 때의 질문 */
export const DEFAULT_MATERIAL_QUESTION =
  "첨부한 자료와 관련된 법령·판례, 살펴볼 점과 진행할 수 있는 절차를 알고 싶어요.";

/** 저장·모델 입력에 들어가는 자료 글자 수 (요약·적힌 내용·읽지 못한 곳) */
export function materialsChars(list: MaterialReading[]): number {
  return list.reduce(
    (n, m) =>
      n +
      m.summary.length +
      m.details.reduce((a, d) => a + d.length, 0) +
      m.gaps.reduce((a, g) => a + g.length, 0),
    0,
  );
}
