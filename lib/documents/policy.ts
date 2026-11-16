// 문서 작성 (내용증명·소장) 순수 규칙 (DEC-022, OQ-003 대기). legal_documents 게이트가 승인되기 전에는 API가 FEATURE_GATED.
// 사용자가 적은 값을 정해진 양식 칸에 그대로 넣기만 한다 — LLM을 쓰지 않고, 법률 판단·주장·이자·금액을 지어내지 않는다.
// 입력에는 이름·주소가 들어가므로 저장하지 않고 응답으로만 돌려준다 (F-007, DEC-006).
import { ApiError } from "@/lib/api/errors";
import type { DocumentKind, OfficialLink } from "@/lib/procedure/steps";
import { OFFICIAL } from "@/lib/procedure/steps";

export const DOCUMENT_KINDS = [
  "demand-letter",
  "complaint",
] as const satisfies readonly DocumentKind[];

export const isDocumentKind = (v: string): v is DocumentKind =>
  (DOCUMENT_KINDS as readonly string[]).includes(v);

/** 문서 결과 표시 (AI 생성물이 아니므로 AI_NOTICE 대신 이 문구) */
export const DOCUMENT_NOTICE = "입력하신 내용으로 채운 양식 · AI 생성 아님 · 법률 자문 아님";
/** 초안 도우미(DEC-023)의 AI 문장이 들어간 문서 표시. AI_NOTICE(서버 응답의 notice)와 함께 보인다 */
export const DRAFT_NOTICE = "초안 · 법률 검토 필요";

type Field = {
  key: string;
  label: string;
  max: number;
  multiline?: boolean;
  optional?: boolean;
  hint?: string;
};

const NAME = 50;
const ADDRESS = 200;
const LONG = 3000;

export type DocumentSpec = {
  kind: DocumentKind;
  title: string;
  /** 단계 이름 (타임라인과 같은 이름) */
  stepLabel: string;
  intro: string;
  tips: string[];
  links: OfficialLink[];
  fields: Field[];
};

export const DOCUMENT_SPECS: Record<DocumentKind, DocumentSpec> = {
  "demand-letter": {
    kind: "demand-letter",
    title: "내용증명",
    stepLabel: "내용증명",
    intro:
      "상대방에게 요구하는 내용을 문서로 보내고, 어떤 내용을 보냈는지 우체국이 증명해 주는 우편이에요.",
    tips: [
      "보내는 사람·받는 사람의 이름과 주소를 정확히 적어요.",
      "언제, 무슨 일이 있었는지 사실만 순서대로 적어요.",
      "요구하는 내용(돌려받을 금액 등)과 답변·이행 기한을 분명히 적어요.",
      "감정적인 표현이나 위협으로 읽힐 수 있는 문장은 빼요.",
      "같은 문서를 여러 부 준비해 우체국에서 보내고, 한 부는 직접 보관해요. 인터넷우체국에서도 보낼 수 있어요.",
      "청구할 수 있는 기간(소멸시효)이 얼마 남지 않았다면 내용증명만으로는 시효가 멈추지 않을 수 있어요. 법원 절차를 함께 검토하세요.",
    ],
    links: [OFFICIAL.epost, OFFICIAL.klac],
    fields: [
      { key: "subject", label: "제목", max: 100, hint: "예: 대여금 반환 요청" },
      { key: "senderName", label: "보내는 사람 이름", max: NAME },
      { key: "senderAddress", label: "보내는 사람 주소", max: ADDRESS },
      { key: "recipientName", label: "받는 사람 이름", max: NAME },
      { key: "recipientAddress", label: "받는 사람 주소", max: ADDRESS },
      { key: "facts", label: "있었던 일 (사실관계)", max: LONG, multiline: true },
      { key: "demand", label: "요구하는 내용", max: LONG, multiline: true },
      { key: "deadline", label: "답변·이행 기한", max: 50, hint: "예: 받으신 날부터 ○일 이내" },
      { key: "writtenOn", label: "작성일", max: 30, optional: true },
    ],
  },
  complaint: {
    kind: "complaint",
    title: "소장",
    stepLabel: "소송 (소장·변론)",
    intro: "법원에 소송을 시작할 때 내는 문서예요. 원고·피고, 청구취지, 청구원인, 증거를 적어요.",
    tips: [
      "청구취지에는 법원에 구하는 결론을, 청구원인에는 그 이유가 되는 사실을 적어요.",
      "증거는 번호를 붙여 목록으로 정리하고 사본을 함께 내요.",
      "관할 법원과 인지대·송달료는 법원 안내(나홀로소송·전자소송)에서 확인해요.",
      "법원 사이트의 공식 서식과 작성례를 함께 참고하세요.",
    ],
    links: [OFFICIAL.proSe, OFFICIAL.ecfs, OFFICIAL.klac],
    fields: [
      { key: "caseName", label: "사건명", max: 100, hint: "예: 대여금 청구의 소" },
      { key: "plaintiffName", label: "원고 이름", max: NAME },
      { key: "plaintiffAddress", label: "원고 주소", max: ADDRESS },
      { key: "defendantName", label: "피고 이름", max: NAME },
      { key: "defendantAddress", label: "피고 주소", max: ADDRESS },
      { key: "claimAim", label: "청구취지", max: LONG, multiline: true },
      { key: "claimCause", label: "청구원인", max: LONG, multiline: true },
      { key: "evidence", label: "입증방법 (증거 목록)", max: LONG, multiline: true },
      { key: "court", label: "제출할 법원", max: 50, hint: "예: ○○지방법원" },
      { key: "writtenOn", label: "작성일", max: 30, optional: true },
    ],
  },
};

export type DocumentInput = Record<string, string>;

/** 본문 검증. 형식 오류는 VALIDATION_ERROR(필드 이름만, 값은 넣지 않는다) */
export function parseDocumentInput(kind: DocumentKind, body: unknown): DocumentInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: DocumentInput = {};
  const fields: string[] = [];
  for (const f of DOCUMENT_SPECS[kind].fields) {
    const v = b[f.key];
    if (v === undefined || v === null || v === "") {
      if (f.optional) {
        out[f.key] = "";
        continue;
      }
      fields.push(f.key);
      continue;
    }
    if (typeof v !== "string") {
      fields.push(f.key);
      continue;
    }
    const t = v.replace(/\r\n?/g, "\n").trim();
    if ((!t && !f.optional) || t.length > f.max || (!f.multiline && t.includes("\n"))) {
      fields.push(f.key);
      continue;
    }
    out[f.key] = t;
  }
  if (fields.length) throw new ApiError("VALIDATION_ERROR", { fields });
  return out;
}

const BLANK_DATE = "        년      월      일";

/** 양식 채우기. 입력값을 칸에 넣기만 하고 새 문장·숫자를 만들지 않는다 */
export function fillDocument(
  kind: DocumentKind,
  v: DocumentInput,
): { title: string; text: string; filename: string } {
  const date = v.writtenOn || BLANK_DATE;
  if (kind === "demand-letter") {
    const text = [
      "내 용 증 명",
      "",
      `제목: ${v.subject}`,
      "",
      `보내는 사람: ${v.senderName}`,
      `주소: ${v.senderAddress}`,
      "",
      `받는 사람: ${v.recipientName}`,
      `주소: ${v.recipientAddress}`,
      "",
      "가. 있었던 일",
      v.facts,
      "",
      "나. 요구하는 내용",
      v.demand,
      "",
      "다. 기한",
      `${v.deadline}까지 위 요구 사항에 대한 답변 또는 이행을 요청합니다.`,
      "",
      date,
      `보내는 사람 ${v.senderName} (서명 또는 인)`,
      "",
    ].join("\n");
    return { title: "내용증명", text, filename: "내용증명.txt" };
  }
  const text = [
    "소    장",
    "",
    `원  고  ${v.plaintiffName}`,
    `        주소 ${v.plaintiffAddress}`,
    `피  고  ${v.defendantName}`,
    `        주소 ${v.defendantAddress}`,
    "",
    v.caseName,
    "",
    "청 구 취 지",
    v.claimAim,
    "",
    "청 구 원 인",
    v.claimCause,
    "",
    "입 증 방 법",
    v.evidence,
    "",
    date,
    `원고 ${v.plaintiffName} (서명 또는 인)`,
    "",
    `${v.court} 귀중`,
    "",
  ].join("\n");
  return { title: "소장", text, filename: "소장.txt" };
}
