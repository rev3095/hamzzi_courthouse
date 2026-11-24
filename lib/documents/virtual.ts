// 가상 문서 (DEC-062): 예시 질문(직접 쓴 가상 사연)의 결과에 붙이는 문서 초안 한 장. 순수 규칙 — 브라우저에서도 쓴다.
// 서비스 요청 경로에서는 만들지 않는다 — 예시 결과에 저장된 문서를 거르고 보이는 데만 쓴다.
// 당사자는 이름 대신 자리(임차인·임대인 등)로만 쓰고, 개인정보 꼴·단정 표현·사연에 없는 숫자가 든 문단은 버린다.
import { z } from "zod";
import { isAssertive, numberTokens } from "@/lib/ai/policy";
import { scanInput } from "@/lib/pii";
import { DOCUMENT_KINDS, DOCUMENT_SPECS } from "./policy";
import type { DocumentKind } from "@/lib/procedure/steps";

export type VirtualDocument = {
  kind: DocumentKind;
  /** 서식 이름 (DOCUMENT_SPECS의 title) */
  formTitle: string;
  title: string;
  sections: { heading: string; body: string }[];
};

export const VIRTUAL_DOC_LIMITS = { sections: 8, heading: 30, body: 600 } as const;

/** 화면에 늘 붙는 고정 문구 */
export const VIRTUAL_DOC_NOTICE =
  "가상 사연으로 만든 예시 초안이에요. 내 사건 문서는 문서 작성에서 내 사실로 다시 쓰세요.";

export const VirtualDocRawZ = z.object({
  kind: z.string(),
  title: z.string(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
});

export const VIRTUAL_DOC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "title", "sections"],
  properties: {
    kind: { type: "string", enum: [...DOCUMENT_KINDS], description: "가장 맞는 서식 종류" },
    title: { type: "string", description: "문서 제목 (예: 임대차보증금 반환 청구의 소)" },
    sections: {
      type: "array",
      description: "서식 순서대로 4~8개 칸",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body"],
        properties: {
          heading: { type: "string", description: "칸 이름, 30자 이내 (예: 청구 취지)" },
          body: { type: "string", description: "칸 내용, 600자 이내" },
        },
      },
    },
  },
} as const;

const squash = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[ \t]+/g, " ")
    .trim();

/** 숫자(단위 포함)·한글 수사는 사연에 같은 토큰이 있을 때만. 조문·사건번호의 숫자는 numberTokens가 뺀다 (절대 규칙 3) */
function numbersOk(text: string, question: string): boolean {
  const q = numberTokens(question);
  const allowed = new Set([...q.digits, ...q.words]);
  const t = numberTokens(text);
  return [...t.digits, ...t.words].every((n) => allowed.has(n));
}

/** 모델이 쓴 가상 문서를 거른다. 문단 하나가 걸리면 그 문단만 빠지고, 남은 칸이 둘보다 적으면 문서를 내지 않는다 */
export function screenVirtualDoc(
  raw: z.infer<typeof VirtualDocRawZ>,
  question: string,
): VirtualDocument | null {
  if (!(DOCUMENT_KINDS as readonly string[]).includes(raw.kind)) return null;
  const kind = raw.kind as DocumentKind;
  const ok = (t: string, max: number) =>
    t.length >= 2 &&
    t.length <= max &&
    scanInput(t).findings.length === 0 &&
    !isAssertive(t) &&
    numbersOk(t, question);
  const title = squash(raw.title);
  if (!ok(title, 60)) return null;
  const sections: VirtualDocument["sections"] = [];
  for (const s of raw.sections) {
    const heading = squash(s.heading);
    const body = s.body.normalize("NFKC").trim();
    if (!ok(heading, VIRTUAL_DOC_LIMITS.heading) || !ok(body, VIRTUAL_DOC_LIMITS.body)) continue;
    sections.push({ heading, body });
    if (sections.length >= VIRTUAL_DOC_LIMITS.sections) break;
  }
  if (sections.length < 2) return null;
  return { kind, formTitle: DOCUMENT_SPECS[kind].title, title, sections };
}

const StoredZ = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  formTitle: z.string(),
  title: z.string(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })).min(1),
});

/** 저장된 결과를 다시 읽을 때 형식 확인 */
export function parseVirtualDoc(v: unknown): VirtualDocument | null {
  const r = StoredZ.safeParse(v);
  return r.success ? r.data : null;
}
