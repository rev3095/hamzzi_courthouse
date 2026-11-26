// 서류 분석 (F-015, DEC-052) — 순수 규칙. 요청 검증과, 모델이 읽어 낸 내용을 화면에 내보내기 전에 거르는 일.
// - 서류 사진은 미리 가릴 수 없어, 사용자가 동의한 경우에만 판독 호출 1회에 그대로 보낸다 (절대 규칙 4의 예외, DEC-052).
//   사진은 요청 메모리에서만 쓰고 저장·로그하지 않는다. 판독 결과는 여기서 가린 것만 응답·저장된다.
// - 개인의 이름은 내보내지 않는다. 모델이 적어 준 개인 이름 목록은 가리는 데만 쓰고 버린다. 표지(주식회사·법원 등)가 있는 상호·기관 이름만 남긴다.
// - 조문 번호·사건번호가 든 문장은 뺀다 — 검증 근거가 아닌 서류 속 인용을 그대로 내보내지 않는다 (절대 규칙 1).
// - 결과를 단정하는 문장은 뺀다 (절대 규칙 2). 누가 잘못했는지는 정하지 않고 서류에 적힌 역할만 옮긴다.
import { z } from "zod";
import { pdfPageCount } from "@/lib/ai/cost";
import { citationsIn, isAssertive } from "@/lib/ai/policy";
import { ApiError } from "@/lib/api/errors";
import {
  maskSurnameStubs,
  nameAfterRelation,
  scanInput,
  type PiiFinding,
  type SensitiveCategory,
} from "@/lib/pii";
import {
  CASEFILE_LIMITS,
  CASEFILE_MEDIA_TYPES,
  DOC_TYPES,
  READING_PURPOSES,
  PARTY_KINDS,
  PARTY_ROLES,
  PARTY_SIDES,
  type CaseFileMediaType,
  type CaseParty,
  type CaseReading,
  type CaseText,
  type DocType,
  type PartyRole,
} from "./limits";

export * from "./limits";

export type CaseImage = { mediaType: CaseFileMediaType; data: string };
export type ReadRequest = { images: CaseImage[]; texts: CaseText[]; question: string };

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** base64 앞부분으로 실제 그림 종류를 본다. 알 수 없으면 null */
export function sniffImage(data: string): CaseFileMediaType | null {
  let head: Uint8Array;
  try {
    head = Uint8Array.from(atob(data.slice(0, 24)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  const at = (i: number) => head[i] ?? -1;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  return null;
}

/**
 * POST /casefiles/read 본문 검증. 오류에는 필드 이름·이유만 담는다 (사진·질문 내용은 담지 않는다).
 * consent.images·consent.sensitive가 모두 true가 아니면 아무것도 처리하지 않고 409 CONSENT_REQUIRED.
 */
export function parseReadRequest(body: unknown): ReadRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  const bad = (reason: string, field = "images") =>
    new ApiError("VALIDATION_ERROR", { fields: [field], reason });

  const rawImages = b.images === undefined ? [] : b.images;
  const rawTexts = b.texts === undefined ? [] : b.texts;
  if (!Array.isArray(rawImages) || !Array.isArray(rawTexts)) throw bad("type");
  if (rawImages.length + rawTexts.length === 0) throw new ApiError("EMPTY_INPUT");
  if (rawImages.length + rawTexts.length > CASEFILE_LIMITS.maxImages) {
    throw new ApiError("VALIDATION_ERROR", {
      fields: ["images"],
      reason: "too_many",
      maxImages: CASEFILE_LIMITS.maxImages,
    });
  }
  if (b.question !== undefined && typeof b.question !== "string") throw bad("type", "question");
  const question = typeof b.question === "string" ? b.question.trim() : "";
  if (question.length > CASEFILE_LIMITS.questionChars) {
    throw new ApiError("VALIDATION_ERROR", {
      fields: ["question"],
      reason: "too_long",
      maxChars: CASEFILE_LIMITS.questionChars,
    });
  }

  let total = 0;
  let pdfPages = 0;
  const images: CaseImage[] = [];
  for (const raw of rawImages) {
    const img = (raw ?? {}) as Record<string, unknown>;
    if (typeof img.data !== "string" || typeof img.mediaType !== "string") throw bad("type");
    if (!(CASEFILE_MEDIA_TYPES as readonly string[]).includes(img.mediaType)) {
      throw bad("media_type");
    }
    const max =
      img.mediaType === "application/pdf"
        ? CASEFILE_LIMITS.maxPdfChars
        : CASEFILE_LIMITS.maxImageChars;
    if (img.data.length === 0 || img.data.length > max) {
      throw bad("too_large");
    }
    total += img.data.length;
    if (total > CASEFILE_LIMITS.maxTotalChars) throw bad("too_large");
    if (!BASE64.test(img.data)) throw bad("encoding");
    // 적어 보낸 종류와 실제 내용이 같아야 한다
    if (sniffImage(img.data) !== img.mediaType) throw bad("media_type");
    if (img.mediaType === "application/pdf") {
      pdfPages += Math.max(1, pdfPageCount(img.data));
      if (pdfPages > CASEFILE_LIMITS.maxPdfPages) throw bad("too_many_pages");
    }
    images.push({ mediaType: img.mediaType as CaseFileMediaType, data: img.data });
  }

  // 문서에서 꺼낸 글 (한글·워드·파워포인트·엑셀·텍스트). 모델에 보내기 전에 lib/ai/casefile이 개인정보를 가린다
  let textTotal = 0;
  const texts: CaseText[] = [];
  for (const raw of rawTexts) {
    const t = (raw ?? {}) as Record<string, unknown>;
    if (typeof t.text !== "string" || (t.name !== undefined && typeof t.name !== "string")) {
      throw bad("type", "texts");
    }
    const text = t.text.replace(/\u0000/g, "").trim();
    if (!text) continue;
    textTotal += text.length;
    if (textTotal > CASEFILE_LIMITS.maxTextChars) throw bad("too_large", "texts");
    // 파일 이름에는 사람 이름이 들어 있을 수 있어 확장자만 남긴다
    const ext = (typeof t.name === "string" ? t.name : "").split(".").pop()?.toLowerCase() ?? "";
    texts.push({ name: /^[a-z0-9]{1,5}$/.test(ext) ? ext : "문서", text });
  }
  if (images.length + texts.length === 0) throw new ApiError("EMPTY_INPUT");

  // 사진 전송 동의와 민감정보 처리 동의를 따로 받는다 (DEC-052). 검증을 통과한 요청만 동의를 따진다
  const consent = (b.consent ?? {}) as Record<string, unknown>;
  if (typeof b.consent !== "object" || consent.images !== true) {
    throw new ApiError("CONSENT_REQUIRED", { kind: "casefile_images" });
  }
  if (consent.sensitive !== true)
    throw new ApiError("CONSENT_REQUIRED", { kind: "sensitive_info" });
  return { images, texts, question };
}

// --- 모델 출력 -------------------------------------------------------------------------

const Str = z.string();
export const ReadingZ = z.object({
  readable: z.boolean(),
  docTypes: z.array(Str),
  summary: Str,
  claims: z.array(Str),
  parties: z.array(z.object({ role: Str, side: Str, kind: Str, name: Str })),
  // 가리는 데만 쓰는 목록 — screenReading이 개요·요구·당사자 이름에서 지운 뒤 버린다 (응답·로그에 싣지 않는다)
  personNames: z.array(Str),
  // 사진 용도 (DEC-070 ③): 녹화된 예전 응답에는 없을 수 있어 선택으로 받는다 — 없으면 사건 서류로 본다
  purpose: Str.optional(),
});
export type ReadingRaw = z.infer<typeof ReadingZ>;

/** 서류의 요구·주장 항목 수 (판독 지시문도 이 값을 쓴다) */
export const CASEFILE_MAX_CLAIMS = 5;
const LIMITS = {
  docTypes: 5,
  claims: CASEFILE_MAX_CLAIMS,
  claimChars: 140,
  parties: 6,
  nameChars: 40,
};

/** 고정 객체라 요청마다 같다 */
export const READING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["readable", "purpose", "docTypes", "summary", "claims", "parties", "personNames"],
  properties: {
    purpose: {
      type: "string",
      enum: [...READING_PURPOSES],
      description:
        "case: 분쟁·절차가 있는 한 사건의 서류(내용증명·소장·고소장·계약서·지급명령·통지서·당사자 사이의 대화 캡처 등). question: 사건 서류가 아니라 무엇인지·어떤 법인지 묻는 일반 사진(안내문·표지판·법령 조문 화면·상품 표시·빈 양식·뉴스 화면 등). 함께 적은 질문도 보고 고른다",
    },
    readable: { type: "boolean", description: "서류의 글자를 읽을 수 있었는지" },
    docTypes: {
      type: "array",
      items: { type: "string", enum: [...DOC_TYPES] },
      description: "서류 종류. 목록에 없으면 기타",
    },
    summary: {
      type: "string",
      description: "서류에 적힌 사실을 일어난 순서대로 정리한 사건 개요. 사람은 이름 대신 역할로",
    },
    claims: {
      type: "array",
      items: { type: "string" },
      description: "서류가 요구하거나 주장하는 것. 한 항목에 한 문장",
    },
    parties: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "side", "kind", "name"],
        properties: {
          role: { type: "string", enum: [...PARTY_ROLES], description: "서류에 적힌 역할" },
          side: {
            type: "string",
            enum: [...PARTY_SIDES],
            description: "claimant 요구·청구하는 쪽, respondent 받는 쪽, other 기관·제3자",
          },
          kind: {
            type: "string",
            enum: [...PARTY_KINDS],
            description: "business 법인·상호가 있는 사업자, agency 법원·관공서, person 개인",
          },
          name: {
            type: "string",
            description:
              "business·agency의 상호·기관 이름만. 대표자·담당자 이름과 직함은 넣지 않는다. person은 빈 문자열",
          },
        },
      },
    },
    personNames: {
      type: "array",
      items: { type: "string" },
      description:
        "서류에 나오는 개인(대표자·담당자 포함)의 이름만 한 항목에 한 사람씩. 직함·역할은 붙이지 않는다. 가리는 데만 쓰고 결과에는 싣지 않는다",
    },
  },
} as const;

const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 서류에 흔한 사건부호(2025차전12345·2025드단1234·2025형제123 등)와 "○○법 390조" 꼴.
 * 판례 인용용 패턴(lib/citations)은 판례 사건부호만 알아서, 서류 판독에는 넓게 본다.
 * 날짜("2025년 3월")와 금액("2000만원을 2024년")은 걸리지 않게 연도 뒤 글자를 가린다.
 */
const CASE_NO_WIDE = /(?:19|20)\d{2}\s*(?![년만억천원월일])[가-힣]{1,3}\s*\d{3,}/;
const ARTICLE_WIDE = /(?:제\s*\d+\s*조|(?:법|령|규칙|조례|약관|조건)\s*\d+\s*조)/;
export const hasCitation = (s: string) => {
  const t = s.normalize("NFKC");
  if (CASE_NO_WIDE.test(t) || ARTICLE_WIDE.test(t)) return true;
  const c = citationsIn(t);
  return c.articles.length > 0 || c.cases.length > 0;
};

/**
 * 사건 개요는 사실만 옮긴다 — 결과를 내다보거나 유불리를 말하는 문장은 뺀다 (절대 규칙 2).
 * 요구·주장 칸에는 걸지 않는다: "배상 책임이 있다고 주장합니다"는 서류의 주장을 옮긴 것이라 남겨야 한다.
 */
const JUDGING =
  /(?:유리|불리)(?:하|한|할|해)|가능성|확률|(?:승소|패소)(?!\s*판결|했|하였|한\s)|이길|이깁|(?<![가-힣])질\s*것|처벌(?:을|를)?\s*받(?:게|을)\s*(?:될|것|수)|책임이\s*(?:있습니다|없습니다)/;
export const isJudging = (s: string) => isAssertive(s) || JUDGING.test(s.normalize("NFKC"));

/** 문장 단위로 나눈다 (마침표·물음표·느낌표·줄바꿈) */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map(squash)
    .filter(Boolean);
}

/** 화면에 나가는 요구·주장 한 줄. 통과하지 못하면 null */
function cleanLine(raw: string, max: number): string | null {
  const t = squash(raw);
  if (t.length < 2 || t.length > max) return null;
  if (isAssertive(t) || hasCitation(t)) return null;
  return t;
}

// --- 이름·번호 가리기 (scanInput에 더해) ---------------------------------------------------
// scanInput(lib/pii)은 호칭·정해진 관계어 뒤의 이름만 잡는다. 서류 판독은 상대방 정보가 훨씬 자주 나오므로
// ① 모델이 따로 적어 준 개인 이름 목록(글 전체에서 가린다) ② 서류 역할어 바로 뒤의 이름 꼴(그 자리만 가린다)
// ③ 차량번호·생년월일·지번 주소 꼴을 더 가린다. 사용자는 확인 화면에서 개요를 고칠 수 있다.

/** 상호·기관으로 보이는 값인지 (personNames에 섞여 들어온 상호를 통째로 지우지 않게). 한글 2~4자는 표지가 있어도 이름으로 본다 */
const looksLikeOrg = (n: string) =>
  (n.length >= 5 || /주식회사|㈜|\(주\)|법인/.test(n)) && (ORG_MARK.test(n) || AGENCY_MARK.test(n));

/** 이름 목록에 섞여 들어온 역할·직함 낱말 (가리면 문장이 망가진다) */
const NOT_A_NAME = new Set<string>([
  ...PARTY_ROLES,
  ..."대표이사 대표자 대표 공동대표 사장 회장 원장 점주 지점장 본부장 이사 팀장 부장 과장 대리 실장 담당자 담당 책임자 변호사 법무사 세무사 노무사 회계사 공인중개사 상대방 본인 개인".split(
    " ",
  ),
]);

/** 역할어 뒤에 자주 오는, 성씨 글자로 시작하는 법률·거래 낱말 (이름 꼴 판단에서 뺀다) */
const LEGAL_WORDS = new Set(
  (
    "권리 권한 이행 이의 이자 이전 임금 임대 임차 전부 전세 전입 전액 조사 조정 주장 주소 지급 지연 진술 진정 " +
    "차임 차용 고소 고발 고지 신청 신고 손해 손실 배상 배당 서면 서류 정산 정정 강제 강요 한도 유치 유예 " +
    "우선 구상 민사 남용 심리 노무 하자 성명 문서 장부 안내 송달 송금 황당 양도 양수 허위 허가 채권 채무 " +
    "최고 최종 박탈 김장 안전 홍보 오류 오해 백지 유효 원금 원상 천재 방문 공사 공탁 현금 현장 변경 변제 " +
    "여부 추가 추심 도급 소유 소송 소장 석명 선고 설정 마감 길이 연차 연체 위약 위반 표시 명의 명도 기한 " +
    "기간 반환 반대 금전 금액 인도 인수 제출 제공 모두 국세 어음 은닉 용역"
  ).split(" "),
);

/** 모델이 적어 준 이름 목록 → 가릴 문자열. 직함이 붙어 온 항목은 낱말로 나눠 이름 부분도 넣는다 */
function nameTargets(personNames: string[]): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const n = raw.trim();
    if (NOT_A_NAME.has(n) || looksLikeOrg(n)) return;
    // 한글은 두 글자부터, 영문은 세 글자부터 (두 글자 영문 조각은 일반 낱말과 겹친다)
    const ok = /^[가-힣]{2,10}$/.test(n) || /^[A-Za-z][A-Za-z .·'-]{2,30}$/.test(n);
    if (ok) out.add(n);
  };
  for (const raw of personNames) {
    const n = squash(raw)
      .replace(/[^가-힣A-Za-z .·'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // 상호·기관이 섞여 들어온 항목은 통째로 건너뛴다 (상호의 낱말을 이름으로 지우지 않게)
    if (!n || looksLikeOrg(n)) continue;
    const parts = n.split(" ");
    if (parts.every((p) => !NOT_A_NAME.has(p))) add(n);
    if (parts.length > 1) for (const p of parts) add(p);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/** lib/pii의 성씨 목록에 없는 한 글자 성 (역할어 바로 뒤·상호 마지막 낱말, 이 두 자리에서만 더 본다) */
const SURNAMES_MORE = "방변설표여추석천함원공현염도소선마길연위명기반왕금옥육인맹제모탁국어은편용";
const TAILS = [
  "에게서", "한테서", "이라고", "이라는", "께서", "에게", "한테", "으로", "라고", "라는", "이며", "이고",
  "은", "는", "이", "가", "을", "를", "의", "에", "도", "와", "과", "로", "께", "씨", "님",
]; // prettier-ignore
/** 이름 뒤에 조사만 오거나 한글이 이어지지 않는 자리 */
const WORD_END = `(?=(?:${TAILS.join("|")})?(?:[^가-힣]|$))`;

/**
 * 역할어 바로 뒤(또는 상호 마지막 자리)의 낱말에서 이름으로 보이는 부분. 상호·직함·법률 낱말이면 null.
 * lib/pii의 판단을 먼저 쓰고, 거기 없는 성씨는 조사 뗀 세 글자 꼴만 한 번 더 본다.
 */
function nameShapeOf(token: string): string | null {
  if (hasMark(token) || NOT_A_NAME.has(token)) return null;
  const known = nameAfterRelation(token);
  if (known) return LEGAL_WORDS.has(known) || LEGAL_WORDS.has(known.slice(0, 2)) ? null : known;
  let stem = token;
  for (const t of TAILS) {
    if (stem.length - t.length >= 3 && stem.endsWith(t)) {
      stem = stem.slice(0, -t.length);
      break;
    }
  }
  if (stem.length !== 3 || !SURNAMES_MORE.includes(stem[0])) return null;
  // 앞 두 글자가 법률·거래 낱말이면("변제금", "공사비", "위약금") 이름이 아니다
  return LEGAL_WORDS.has(stem.slice(0, 2)) || NOT_A_NAME.has(stem) ? null : stem;
}

const ROLE_WORDS = PARTY_ROLES.filter((r) => r !== "기타").join("|");
const AFTER_ROLE = new RegExp(`((?:^|[^가-힣])(?:${ROLE_WORDS})\\s+)([가-힣]{2,7})`, "g");

/** 번호판 가운데 글자 */
const PLATE = "가나다라마거너더러머버서어저고노도로모보소오조구누두루무부수우주아바사자하허호배";
/** 번호 꼴: 생년월일 · 차량번호(날짜·금액과 겹치지 않게) · 시도 없이 적힌 지번 주소(번지나 -숫자가 있을 때만) */
const EXTRA_NUMERIC: [string, RegExp][] = [
  ["[생년월일]", /(?:19|20)\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*[.일]?\s*생/g],
  [
    "[차량번호]",
    new RegExp(`(?<!\\d)\\d{2,3}\\s?[${PLATE}]\\s?\\d{4}(?![\\d만억천원년월일])`, "g"),
  ],
  ["[주소]", /[가-힣]{1,6}(?:구|군)\s+[가-힣0-9]{1,8}(?:동|읍|면|리)\s*\d+(?:-\d+|\s*번지)/g],
];

/**
 * scanInput이 가린 글에서 남은 개인 이름·번호를 더 가린다. 이름 번호는 이미 쓰인 [이름N] 다음부터 매긴다.
 * 돌려주는 added는 새로 가린 이름·그 밖의 개수.
 */
export function maskMore(masked: string, personNames: string[]) {
  // ⓪ 서면이 이미 일부 가린 "박○○" 꼴은 성씨도 남기지 않는다
  const stubs = maskSurnameStubs(masked);
  let text = stubs.text;
  let other = 0;
  for (const [token, re] of EXTRA_NUMERIC) {
    text = text.replace(re, () => {
      other += 1;
      return token;
    });
  }

  let next = Math.max(0, ...[...text.matchAll(/\[이름(\d+)\]/g)].map((m) => Number(m[1]))) + 1;
  const tokens = new Map<string, string>();
  const tokenOf = (n: string) => {
    if (!tokens.has(n)) tokens.set(n, `[이름${next++}]`);
    return tokens.get(n)!;
  };
  let name = stubs.count;

  // ① 모델이 적어 준 이름: 글 전체에서 (앞 글자가 이어지지 않는 자리만)
  for (const n of nameTargets(personNames)) {
    const re = new RegExp(`(?<![가-힣A-Za-z])${escapeRe(n)}`, "g");
    text = text.replace(re, () => {
      name += 1;
      return tokenOf(n);
    });
  }
  // ② 서류 역할어 바로 뒤의 이름 꼴. 세 글자 이상이면 같은 이름의 다른 자리도 낱말 단위로 가리고
  //    (한 번 소개한 뒤 다시 부르는 꼴), 두 글자는 그 자리만 가린다 (일반 낱말을 글 전체에서 지우지 않게)
  const again = new Set<string>();
  text = text.replace(AFTER_ROLE, (m: string, head: string, token: string) => {
    const stem = nameShapeOf(token);
    if (!stem) return m;
    name += 1;
    if (stem.length >= 3) again.add(stem);
    return `${head}${tokenOf(stem)}${token.slice(stem.length)}`;
  });
  for (const stem of again) {
    const re = new RegExp(`(?<![가-힣A-Za-z])${escapeRe(stem)}${WORD_END}`, "g");
    text = text.replace(re, () => {
      name += 1;
      return tokenOf(stem);
    });
  }
  return { text, added: { name, other } };
}

export type ScreenedReading = {
  reading: CaseReading;
  /** 사건 개요·요구에서 가린 개인정보 종류와 개수 (값은 남기지 않는다) */
  findings: PiiFinding[];
  sensitive: SensitiveCategory[];
  /** 걸러 낸 문장 수 (결과를 말하는 표현·조문이나 사건번호). 화면이 "일부 문장은 뺐어요"를 알리는 데 쓴다 */
  dropped: number;
};

/**
 * 모델이 읽어 낸 내용을 거른다. 사건 개요는 문장마다 판정 표현·조문/사건번호를 보고, 남은 글 전체를 한 번에 가린다.
 * 읽을 수 없었거나 개요가 비면 null — 호출한 쪽이 "읽지 못했다"로 처리한다.
 */
export function screenReading(raw: ReadingRaw): ScreenedReading | null {
  if (!raw.readable) return null;
  let dropped = 0;

  const kept: string[] = [];
  let length = 0;
  for (const s of sentences(raw.summary)) {
    if (isJudging(s) || hasCitation(s)) {
      dropped += 1;
      continue;
    }
    // 길이를 넘기면 문장 중간에서 자르지 않고 거기서 멈춘다
    if (length + s.length + 1 > CASEFILE_LIMITS.summaryChars) break;
    kept.push(s);
    length += s.length + 1;
  }
  if (kept.length === 0) return null;

  const claims: string[] = [];
  for (const c of raw.claims) {
    if (claims.length >= LIMITS.claims) break;
    const t = cleanLine(c, LIMITS.claimChars);
    if (t) claims.push(t);
    else dropped += 1;
  }

  // 개요와 요구를 한 글로 가려 같은 이름이 같은 번호([이름1])를 받게 한다
  const SEP = "\n@@\n";
  const scan = scanInput([kept.join(" "), ...claims].join(SEP));
  const more = maskMore(scan.maskedText, raw.personNames);
  const [summary = "", ...maskedClaims] = more.text.split(SEP);

  const findings = scan.findings.map((f) => ({ ...f }));
  const bump = (type: PiiFinding["type"], n: number) => {
    if (n === 0) return;
    const hit = findings.find((f) => f.type === type);
    if (hit) hit.count += n;
    else findings.push({ type, count: n });
  };
  bump("name", more.added.name);
  // 주소·차량번호·생년월일은 화면 표시에서 "주소"로 묶는다 (값은 남기지 않는다)
  bump("address", more.added.other);

  // 서류 종류는 정해진 목록의 값만 (자유 문구로 이름이 섞이지 않게)
  const docTypes = [
    ...new Set(
      raw.docTypes.filter((d): d is DocType => (DOC_TYPES as readonly string[]).includes(d)),
    ),
  ].slice(0, LIMITS.docTypes);

  return {
    reading: {
      purpose: raw.purpose === "question" ? "question" : "case",
      docTypes,
      summary,
      claims: maskedClaims,
      parties: screenParties(raw.parties, raw.personNames),
    },
    findings,
    sensitive: scan.sensitive,
    dropped,
  };
}

/** 이 낱말부터 뒤는 사람(대표자·담당자)에 대한 말이라 잘라 낸다: "주식회사 한빛 대표이사 ○○○" → "주식회사 한빛" */
const TITLE_CUT =
  /\s*[([]?\s*(?:대표\s*이사|대표자|공동\s*대표|대표|사장|회장|원장|점주|지점장|본부장|이사|팀장|부장|과장|대리|실장|담당자|담당|책임자|귀하|귀중|PMO|CEO|CTO|CFO)(?![가-힣A-Za-z]).*$/i;

/**
 * 법인·상호의 표지. 이것이 있어야 이름을 남긴다 — 표지가 없는 두세 글자 이름은 개인일 수 있어 비운다.
 * 사람의 직업 이름(법무사·세무사·공인중개사 등)은 표지로 보지 않고, 사업장 꼴(사무소·○○법인)만 본다.
 * (표지가 없는 작은 가게 상호는 "이름을 읽지 못했어요"로 보인다. 개인 이름이 나가는 것보다 낫다.)
 */
export const ORG_MARK =
  /주식회사|유한회사|유한책임회사|합자회사|합명회사|\(주\)|㈜|\(유\)|법인|조합|재단|협회|연합회|은행|금고|보험|증권|카드|캐피탈|저축|신탁|병원|의원|약국|치과|학원|학교|대학|유치원|어린이집|마트|상사|상회|건설|산업|전자|물산|개발|공업|제약|화학|통신|해운|항공|운수|택배|부동산|사무소|식당|카페|호텔|스튜디오|센터(?!장)|\b(?:Inc|Ltd|LLC|Corp|Co|Group|GmbH|Limited|Company|PLC|Pte|AG|SA)\b\.?/i;
/** 기관 표지 */
export const AGENCY_MARK =
  /법원|검찰청|지청|경찰서|경찰청|구청|시청|군청|도청|주민센터|행정복지센터|세무서|국세청|노동청|고용노동|공단|공사|위원회|우체국|등기소|교육청|보건소|진흥원|감독원|공정거래|소비자원|법률구조|출입국/;
const hasMark = (s: string) => ORG_MARK.test(s) || AGENCY_MARK.test(s);

/** 상호·기관 이름으로 남길 수 있으면 그 이름, 아니면 빈 문자열 */
export function orgNameOf(
  rawName: string,
  kind: "business" | "agency",
  personNames: string[] = [],
): string {
  let t = squash(rawName).replace(TITLE_CUT, "").trim();
  // 모델이 따로 적어 준 개인 이름이 남아 있으면 지운다
  for (const n of nameTargets(personNames)) {
    t = t.replace(new RegExp(`(?<![가-힣A-Za-z])${escapeRe(n)}`, "g"), "").trim();
  }
  // 서면이 일부 가린 사람 이름("박○○", "○○○님")은 낱말째 뗀다 ("○○물산"처럼 붙은 상호는 그대로)
  t = maskSurnameStubs(t)
    .text.replace(/(?:^|\s)○○○[가-힣]{0,3}(?=\s|$)/g, " ")
    .trim();
  // 상호 뒤에 띄어 붙은 마지막 낱말이 이름 꼴이면 뗀다: "주식회사 한빛주택 ○○○" (표지가 든 낱말은 그대로)
  const words = squash(t).split(" ");
  // 앞부분이 "주식회사" 같은 법인 꼴 낱말 하나뿐이면 뒤 낱말이 상호다 — 떼지 않는다
  const bareForm =
    /^(?:주식회사|유한회사|유한책임회사|합자회사|합명회사|\(주\)|㈜|\(유\)|재단법인|사단법인|의료법인|학교법인)$/;
  if (words.length > 2 || (words.length === 2 && !bareForm.test(words[0]) && hasMark(words[0]))) {
    const last = words[words.length - 1];
    if (/^[가-힣]{3,4}$/.test(last) && nameShapeOf(last) !== null) {
      words.pop();
    }
  }
  t = words.join(" ").replace(/[\s,·\-–(:[]+$/, "");
  if (t.length < 2 || t.length > LIMITS.nameChars || /[[\]<>]/.test(t)) return "";
  // 한글 두세 글자뿐인 값은 표지가 있어도 사람 이름일 수 있다 ("○지원", "○은행", "○상회")
  if (/^[가-힣]{2,3}$/.test(t)) return "";
  // 연락처·주소·번호, 가려진 이름, 조문·사건번호, 판정 표현이 섞였으면 비운다
  if (scanInput(t).findings.length > 0) return "";
  if (hasCitation(t) || isJudging(t)) return "";
  return (kind === "business" ? ORG_MARK.test(t) : hasMark(t)) ? t : "";
}

/**
 * 당사자 목록. 역할·자리·종류는 정해진 값만 받고, 개인은 이름을 버린다.
 * 법인·사업자·기관은 표지가 있는 상호·기관 이름만 남기고 대표자·담당자 이름과 직함은 잘라 낸다.
 */
export function screenParties(raw: ReadingRaw["parties"], personNames: string[] = []): CaseParty[] {
  const out: CaseParty[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    if (out.length >= LIMITS.parties) break;
    const role: PartyRole = (PARTY_ROLES as readonly string[]).includes(p.role)
      ? (p.role as PartyRole)
      : "기타";
    const side = (PARTY_SIDES as readonly string[]).includes(p.side)
      ? (p.side as CaseParty["side"])
      : "other";
    const kind = (PARTY_KINDS as readonly string[]).includes(p.kind)
      ? (p.kind as CaseParty["kind"])
      : "person";
    const name = kind === "person" ? "" : orgNameOf(p.name, kind, personNames);
    const key = `${role}|${side}|${kind}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role, side, kind, name });
  }
  return out;
}
