// 서류 분석 (F-015, DEC-052) — 브라우저 쪽. 사진 줄이기, 판독·조회 API 호출, 당사자 목록을 이 탭에 잠깐 두기.
// 사진은 화면 메모리에만 있고 브라우저 저장소에 넣지 않는다. 다시 그려 JPEG로 바꾸는 과정에서 촬영 위치 같은 사진 속 부가 정보는 빠진다.
import type { ErrorCode } from "@/lib/api/errors";
import {
  CASEFILE_LIMITS,
  PARTY_KINDS,
  PARTY_ROLES,
  PARTY_SIDES,
  type CaseParty,
  type CaseReading,
  type PartyKind,
  type PartyRole,
  type PartySide,
} from "@/lib/casefile/limits";
import type { PiiFinding } from "@/lib/pii";
import { call } from "./api";
import { extractDocText, isTextDoc } from "./docs";

/**
 * 붙인 서류 한 개 (2026-11-24: 사진 30장 + PDF·문서). 이름은 하위 호환으로 PreparedImage.
 * - 사진: 줄인 JPEG base64. 원본 File을 들고 있다가 보내기 직전 전체 한도에 맞춰 다시 줄인다(fitToBudget)
 * - PDF: base64 그대로 (모델이 쪽마다 읽는다)
 * - 문서(hwp·hwpx·docx·pptx·xlsx·txt): 브라우저에서 꺼낸 글만. 서버가 개인정보를 가린 뒤 모델에 보낸다
 */
export type PreparedImage =
  | {
      kind?: "image";
      id: string;
      name: string;
      mediaType: "image/jpeg";
      /** base64 (data: 머리말 없음) */
      data: string;
      /** 화면 미리보기용 주소 (URL.revokeObjectURL로 푼다) */
      previewUrl: string;
      file?: File;
    }
  | {
      kind: "pdf";
      id: string;
      name: string;
      mediaType: "application/pdf";
      data: string;
      previewUrl: "";
    }
  | { kind: "text"; id: string; name: string; text: string; previewUrl: "" };

export type PrepareError = "not_image" | "decode_failed" | "too_large" | "empty" | "unsupported";

const blobOf = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * 사진 한 장을 서버 한도 안의 JPEG로 줄인다. 큰 크기·좋은 화질부터 시도하고 넘치면 줄인다.
 * 글자가 읽히도록 가능한 한 크게 남긴다.
 */
export async function prepareImage(
  file: File,
  maxChars: number = CASEFILE_LIMITS.maxImageChars,
  longEdges: readonly number[] = CASEFILE_LIMITS.longEdges,
): Promise<{ ok: true; image: PreparedImage } | { ok: false; error: PrepareError }> {
  if (!file.type.startsWith("image/")) return { ok: false, error: "not_image" };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, error: "decode_failed" };
  }
  try {
    for (const longEdge of longEdges) {
      const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return { ok: false, error: "decode_failed" };
      // 투명 배경(PNG)은 흰색으로 깐다
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.72, 0.6, 0.5]) {
        const blob = await blobOf(canvas, quality);
        if (!blob) continue;
        const data = await toBase64(blob);
        if (data.length <= maxChars) {
          return {
            ok: true,
            image: {
              kind: "image",
              id: crypto.randomUUID(),
              name: file.name,
              mediaType: "image/jpeg",
              data,
              previewUrl: URL.createObjectURL(blob),
              file,
            },
          };
        }
      }
    }
    return { ok: false, error: "too_large" };
  } finally {
    bitmap.close();
  }
}

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** 사진·PDF·문서를 붙일 수 있는 꼴로 바꾼다 */
export async function prepareAttachment(
  file: File,
): Promise<{ ok: true; image: PreparedImage } | { ok: false; error: PrepareError }> {
  if (file.type.startsWith("image/")) return prepareImage(file);
  if (isPdf(file)) {
    const data = await toBase64(file);
    if (data.length > CASEFILE_LIMITS.maxPdfChars) return { ok: false, error: "too_large" };
    return {
      ok: true,
      image: {
        kind: "pdf",
        id: crypto.randomUUID(),
        name: file.name,
        mediaType: "application/pdf",
        data,
        previewUrl: "",
      },
    };
  }
  if (isTextDoc(file)) {
    const r = await extractDocText(file);
    if (!r.ok) {
      return {
        ok: false,
        error: r.error === "broken" ? "decode_failed" : r.error,
      };
    }
    return {
      ok: true,
      image: {
        kind: "text",
        id: crypto.randomUUID(),
        name: file.name,
        text: r.text.slice(0, CASEFILE_LIMITS.maxTextChars),
        previewUrl: "",
      },
    };
  }
  return { ok: false, error: "unsupported" };
}

export const isAttachable = (file: File) =>
  file.type.startsWith("image/") || isPdf(file) || isTextDoc(file);

/**
 * 보내기 직전에 사진들을 전체 한도(약 4MB) 안으로 다시 줄인다. 사진이 10장을 넘으면 긴 변 1,200px 이하로 맞춘다
 * (서버의 토큰 추정 MANY_IMAGES_TOKEN_ESTIMATE와 맞춘 값). 원본 File이 없는 사진은 그대로 둔다.
 */
export async function fitToBudget(items: PreparedImage[]): Promise<PreparedImage[]> {
  const pictures = items.filter((i) => (i.kind ?? "image") === "image");
  if (pictures.length === 0) return items;
  const pdfChars = items.reduce((n, i) => n + (i.kind === "pdf" ? i.data.length : 0), 0);
  const budget = CASEFILE_LIMITS.maxTotalChars - pdfChars - 60_000;
  const picChars = pictures.reduce((n, i) => n + ("data" in i ? i.data.length : 0), 0);
  const many = pictures.length > 10;
  if (picChars <= budget && !many) return items;
  const per = Math.max(
    40_000,
    Math.min(CASEFILE_LIMITS.maxImageChars, Math.floor(budget / pictures.length)),
  );
  const edges = many ? [1200, 1000, 800] : [1568, 1200, 1000, 800];
  const out: PreparedImage[] = [];
  for (const item of items) {
    if (item.kind === "pdf" || item.kind === "text" || !item.file) {
      out.push(item);
      continue;
    }
    const r = await prepareImage(item.file, per, edges);
    if (r.ok && r.image.kind !== "pdf" && r.image.kind !== "text") {
      URL.revokeObjectURL(r.image.previewUrl);
      out.push({ ...r.image, id: item.id, previewUrl: item.previewUrl });
    } else out.push(item);
  }
  return out;
}

/** 판독 요청 본문의 images·texts */
export async function attachmentBody(items: PreparedImage[]) {
  const fitted = await fitToBudget(items);
  return {
    images: fitted.flatMap((i) =>
      i.kind === "text" ? [] : [{ mediaType: i.mediaType, data: i.data }],
    ),
    texts: fitted.flatMap((i) => (i.kind === "text" ? [{ name: i.name, text: i.text }] : [])),
  };
}

export type ReadAi =
  | { used: true }
  | { used: false; reason: "free_mode" | "budget" | "cost_cap" | "model_failed" | "unreadable" };

export type ReadResult = {
  reading: CaseReading | null;
  piiFindings: PiiFinding[];
  sensitive: string[];
  /** 걸러 낸 문장 수 */
  dropped?: number;
  ai: ReadAi;
  notice: string | null;
};

/** POST /casefiles/read */
export const readCaseFiles = async (images: PreparedImage[], question: string) =>
  call<ReadResult>("/api/v1/casefiles/read", {
    method: "POST",
    body: JSON.stringify({
      ...(await attachmentBody(images)),
      question,
      // 화면에서 사진 전송·민감정보 처리 두 항목을 모두 동의한 뒤에만 부른다
      consent: { images: true, sensitive: true },
    }),
  });

/** 판독 오류를 사용자 문장으로. 서버 고정 값만 쓰고 입력 내용은 넣지 않는다 */
export function readErrorText(code: ErrorCode, reason?: unknown): string {
  if (code === "VALIDATION_ERROR") {
    if (reason === "too_many")
      return `사진·문서는 ${CASEFILE_LIMITS.maxImages}개까지 올릴 수 있어요.`;
    if (reason === "too_large")
      return "자료가 너무 커요. 개수를 줄이거나 더 작은 파일로 올려 주세요.";
    return "올릴 수 없는 파일이 있어요. 사진·PDF·한글·워드·파워포인트·엑셀·텍스트 파일로 다시 올려 주세요.";
  }
  if (code === "RATE_LIMITED") {
    return reason === "casefile_hourly"
      ? "이 네트워크에서 서류 읽기를 많이 했어요. 잠시 뒤에 다시 해 주세요."
      : "오늘 쓸 수 있는 횟수를 다 썼어요.";
  }
  if (code === "LOGIN_REQUIRED") return "오늘 쓸 수 있는 질문 횟수를 다 썼어요.";
  return "서류를 읽는 중에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.";
}

export const READ_UNAVAILABLE: Record<Exclude<ReadAi, { used: true }>["reason"], string> = {
  free_mode:
    "지금은 AI 답변이 꺼져 있어서 서류 사진을 읽을 수 없어요. 서류 내용을 글로 적어 물어봐 주세요.",
  budget:
    "이번 기간에 쓸 수 있는 AI 예산을 다 써서 서류 사진을 읽을 수 없어요. 서류 내용을 글로 적어 물어봐 주세요.",
  cost_cap: "사진이 많거나 커서 한 번에 읽을 수 있는 양을 넘었어요. 장수를 줄여 다시 해 주세요.",
  model_failed: "서류를 읽는 중에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.",
  unreadable: "사진에서 글자를 읽지 못했어요. 더 밝고 또렷한 사진으로 다시 올려 주세요.",
};

// --- 당사자 목록: 이 탭에만 (개인 이름 없음 — 법인·사업자·기관 이름과 서류상 역할만) -----------------
const FKEY = (id: string) => `hz:f:${id}`;
const ROLE_OK = (v: unknown): v is PartyRole => (PARTY_ROLES as readonly unknown[]).includes(v);
const SIDES: readonly PartySide[] = PARTY_SIDES;
const KINDS: readonly PartyKind[] = PARTY_KINDS;

export function rememberParties(id: string, parties: CaseParty[]) {
  try {
    if (parties.length > 0) sessionStorage.setItem(FKEY(id), JSON.stringify(parties));
  } catch {
    // 저장소를 못 쓰면 결과 화면에 당사자 표시만 빠진다
  }
}

/** 저장된 문자열(없으면 null). useSyncExternalStore에 그대로 쓸 수 있게 문자열로 돌려준다 */
export function recallPartiesRaw(id: string): string | null {
  try {
    return sessionStorage.getItem(FKEY(id));
  } catch {
    return null;
  }
}

export function parseParties(raw: string | null): CaseParty[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.flatMap((p: Partial<CaseParty> | null) =>
      p &&
      ROLE_OK(p.role) &&
      SIDES.includes(p.side as PartySide) &&
      KINDS.includes(p.kind as PartyKind) &&
      typeof p.name === "string"
        ? [
            {
              role: p.role,
              side: p.side as PartySide,
              kind: p.kind as PartyKind,
              // 개인은 이름을 두지 않는다 (저장된 값이 바뀌었더라도)
              name: p.kind === "person" ? "" : p.name.slice(0, 40),
            },
          ]
        : [],
    );
  } catch {
    return [];
  }
}

// --- 법인·사업자 공개 정보 조회 ------------------------------------------------------------
export type PlaceItem = {
  title: string;
  category: string | null;
  address: string | null;
  roadAddress: string | null;
  link: string | null;
};
export type CorpItem = {
  corpName: string;
  address: string | null;
  establishedAt: string | null;
  industry: string | null;
  homepage: string | null;
};
type Source<T> = { status: "ok" | "empty" | "no_key" | "failed"; items: T[] };
export type BusinessLookup = {
  places: Source<PlaceItem>;
  corps: Source<CorpItem>;
  links: { label: string; url: string }[];
  notice: string;
};

/** 이름은 본문으로 보낸다 — 주소·접속 기록에 남지 않게 */
export const lookupBusiness = (name: string) =>
  call<BusinessLookup>("/api/v1/businesses/lookup", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
