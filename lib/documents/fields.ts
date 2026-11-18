// 서식 정의에 쓰는 형식·공통 칸 (DEC-025). 서식이 늘어 policy.ts와 specs/*에서 함께 쓴다. 브라우저에서도 쓴다.
import type { DocumentKind, OfficialLink } from "@/lib/procedure/steps";

/** 문서 결과 표시 (AI 생성물이 아니므로 AI_NOTICE 대신 이 문구) */
export const DOCUMENT_NOTICE = "입력하신 내용으로 채운 양식 · AI 생성 아님 · 법률 자문 아님";
/** 초안 도우미(DEC-023)의 AI 문장이 들어간 문서 표시. AI_NOTICE(서버 응답의 notice)와 함께 보인다 */
export const DRAFT_NOTICE = "초안 · 법률 검토 필요";
/** 모든 서식 공통 — 제출·발송 전 확인 (절대 규칙 2: 결과를 단정하지 않는다) */
export const CHECK_NOTICE =
  "이 양식은 참고용 초안이에요. 내거나 보내기 전에 받는 기관(법원·경찰서·노동관서·위원회·우체국 등)의 안내를 확인하고, 변호사·법무사·공인노무사 또는 대한법률구조공단 상담을 받아 보세요.";
/** 주민등록번호는 받지 않는다 (F-007) — 공식 서식에 칸이 있어 빈칸으로 남긴다 */
export const RRN_NOTICE =
  "이 문서에는 주민등록번호 칸을 빈칸으로 두었어요. 햄찌법원은 주민등록번호를 받지 않으니, 내보낸 문서에 직접 적어 주세요.";
/** 생년월일도 받지 않는다 — 주민등록번호와 같이 빈칸으로 남긴다 (F-007) */
export const BIRTH_NOTICE =
  "이 문서에는 생년월일 칸을 빈칸으로 두었어요. 햄찌법원은 생년월일을 받지 않으니, 내보낸 문서에 직접 적어 주세요.";

export type FieldType = "text" | "textarea" | "date" | "money" | "rate" | "choice" | "checks";
export type FieldOption = { value: string; label: string };

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  max: number;
  optional?: boolean;
  /** 쉬운 설명 */
  help?: string;
  /** 예시 (숫자 대신 ○) */
  example?: string;
  options?: FieldOption[];
  /** 다른 칸이 채워졌을 때(value가 있으면 그 값일 때)만 묻는다 */
  when?: { key: string; value?: string };
  /** 처음 값 (choice·checks) */
  defaultValue?: string;
};

export type FormPage = { title: string; help?: string; fields: string[] };

/** 공식 기관 서식 (이름은 기관 목록 표기 그대로) */
export type OfficialForm = { name: string; source: string; url: string };

export type DocumentSpec = {
  kind: DocumentKind;
  title: string;
  /** 단계 이름 (타임라인과 같은 이름) */
  stepLabel: string;
  intro: string;
  tips: string[];
  links: OfficialLink[];
  officialForms: OfficialForm[];
  /** 항목 구성의 법령 근거 (조문 이름) */
  basis: string[];
  /** 초안 도우미가 채우는 칸 이름 (화면 안내) */
  draftFields: string;
  /** 공식 서식의 안내 문구를 그대로 인용 (예: 고소장의 허위 고소 서약). 출처를 함께 보인다 */
  officialNotice?: { text: string; source: string };
  fields: Field[];
  pages: FormPage[];
};

export const NAME = 50;
export const ADDRESS = 200;
export const PHONE = 30;
export const LONG = 3000;
export const SCOURT_FORMS = "https://www.scourt.go.kr/nm/minwon/doc/DocListAction.work";
export const COURT_SOURCE = "대한민국 법원 전자민원센터 양식모음";

export const name = (key: string, label: string, help?: string): Field => ({
  key,
  label,
  type: "text",
  max: NAME,
  help,
});
export const address = (key: string, label: string): Field => ({
  key,
  label,
  type: "text",
  max: ADDRESS,
  help: "도로명주소와 동·호수까지 적어요. 법원·우체국은 이 주소로 서류를 보내요.",
  example: "○○시 ○○구 ○○로 ○○, ○○동 ○○호",
});
export const phone = (key: string, label: string): Field => ({
  key,
  label,
  type: "text",
  max: PHONE,
  optional: true,
  help: "법원이 연락할 수 있는 번호예요. 비워 두면 문서에 빈칸으로 남아요.",
});
export const writtenOn: Field = {
  key: "writtenOn",
  label: "작성일",
  type: "date",
  max: 10,
  optional: true,
  help: "비워 두면 날짜 칸을 비워 두고, 내기 전에 직접 적을 수 있어요.",
};
export const court = (help: string): Field => ({
  key: "court",
  label: "제출할 법원",
  type: "text",
  max: 50,
  help,
  example: "○○지방법원",
});
export const interestFields = (servedLabel: string): Field[] => [
  {
    key: "interestRate",
    label: "이자·지연손해금 이율 (연 %)",
    type: "rate",
    max: 5,
    optional: true,
    help: "약정한 이율이나 법이 정한 이율을 숫자만 적어요. 잘 모르면 비워 두고 법원 안내를 확인하세요. 비우면 원금만 청구하는 문장이 돼요.",
  },
  {
    key: "interestFrom",
    label: "이자를 셈하기 시작하는 날",
    type: "choice",
    max: 10,
    when: { key: "interestRate" },
    defaultValue: "served",
    options: [
      { value: "served", label: servedLabel },
      { value: "date", label: "직접 정한 날부터" },
    ],
  },
  {
    key: "interestDate",
    label: "이자를 셈하기 시작하는 날짜",
    type: "date",
    max: 10,
    when: { key: "interestFrom", value: "date" },
  },
];
