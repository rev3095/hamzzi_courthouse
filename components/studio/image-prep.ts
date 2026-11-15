// 편집기에서 올린 그림을 마스코트 규격(480×635 투명 webp, 발 기준 아래 정렬)으로 바꾼다. 브라우저 안에서만 처리한다.
// 기본 그림(hamzzi-judge.webp)과 같은 틀: 투명 여백을 잘라 낸 뒤 사방 7px 여백 안에 맞춘다.
import { MASCOT_SIZE } from "@/lib/mascot/moods";
import { MAX_MASCOT_BYTES } from "@/lib/mascot/policy";

export const ACCEPT_TYPES = ["image/png", "image/webp", "image/jpeg"] as const;
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_PIXELS = 4096 * 4096;
const MARGIN = 7;
const QUALITY = 0.9;

export type PrepProblem =
  "type" | "input_too_large" | "dimensions" | "decode" | "empty" | "encode" | "output_too_large";

export const PREP_PROBLEM_TEXT: Record<PrepProblem, string> = {
  type: "PNG·WebP·JPEG 그림만 올릴 수 있어요.",
  input_too_large: "원본 파일이 15MB를 넘어요.",
  dimensions: "그림이 너무 커요. 한 변 4096px 이하로 줄여 주세요.",
  decode: "그림을 읽지 못했어요. 파일이 깨졌는지 확인해 주세요.",
  empty: "그림이 모두 투명해서 담을 내용이 없어요.",
  encode: "이 브라우저는 webp로 저장하지 못해요. Chrome·Edge에서 열어 주세요.",
  output_too_large: "바꾼 그림이 800KB를 넘어요. 단순한 그림으로 다시 시도해 주세요.",
};

export class PrepError extends Error {
  constructor(readonly problem: PrepProblem) {
    super(problem);
  }
}

export type Prepared = {
  blob: Blob;
  url: string;
  bytes: number;
  source: { name: string; type: string; bytes: number; width: number; height: number };
  /** 네 모서리가 투명하고 투명 영역이 어느 정도 있으면 true */
  transparent: boolean;
  /** 투명한 픽셀 비율 (0~1) */
  transparentShare: number;
  trimmed: boolean;
};

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new PrepError("decode");
  return { c, ctx };
}

/** 크게 줄일 때 계단 현상을 줄이려고 절반씩 나눠 줄인다 */
function downscale(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  let cur = src;
  while (cur.width / 2 > w && cur.height / 2 > h) {
    const { c, ctx } = canvas(Math.round(cur.width / 2), Math.round(cur.height / 2));
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
  }
  const { c, ctx } = canvas(w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, w, h);
  return c;
}

export async function prepareMascot(file: File, opts: { trim: boolean }): Promise<Prepared> {
  if (!(ACCEPT_TYPES as readonly string[]).includes(file.type)) throw new PrepError("type");
  if (file.size > MAX_INPUT_BYTES) throw new PrepError("input_too_large");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new PrepError("decode");
  }
  const { width: W, height: H } = bmp;
  if (W * H > MAX_INPUT_PIXELS) throw new PrepError("dimensions");

  const src = canvas(W, H);
  src.ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const px = src.ctx.getImageData(0, 0, W, H).data;

  let clear = 0;
  let minX = W,
    minY = H,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = px[(y * W + x) * 4 + 3];
      if (a < 8) clear++;
      else {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new PrepError("empty");
  const alphaAt = (x: number, y: number) => px[(y * W + x) * 4 + 3];
  const cornersClear = [
    alphaAt(0, 0),
    alphaAt(W - 1, 0),
    alphaAt(0, H - 1),
    alphaAt(W - 1, H - 1),
  ].every((a) => a < 8);
  const transparentShare = clear / (W * H);

  const crop = opts.trim
    ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
    : { x: 0, y: 0, w: W, h: H };
  const cropped = canvas(crop.w, crop.h);
  cropped.ctx.drawImage(src.c, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

  const boxW = MASCOT_SIZE.width - MARGIN * 2;
  const boxH = MASCOT_SIZE.height - MARGIN * 2;
  const scale = Math.min(boxW / crop.w, boxH / crop.h);
  const dw = Math.max(1, Math.round(crop.w * scale));
  const dh = Math.max(1, Math.round(crop.h * scale));
  const scaled = downscale(cropped.c, dw, dh);

  const out = canvas(MASCOT_SIZE.width, MASCOT_SIZE.height);
  // 가운데 정렬, 아래(발) 기준
  out.ctx.drawImage(
    scaled,
    Math.round((MASCOT_SIZE.width - dw) / 2),
    MASCOT_SIZE.height - MARGIN - dh,
  );

  const blob = await new Promise<Blob | null>((res) => out.c.toBlob(res, "image/webp", QUALITY));
  if (!blob || blob.type !== "image/webp") throw new PrepError("encode");
  if (blob.size > MAX_MASCOT_BYTES) throw new PrepError("output_too_large");

  return {
    blob,
    url: URL.createObjectURL(blob),
    bytes: blob.size,
    source: { name: file.name, type: file.type, bytes: file.size, width: W, height: H },
    transparent: cornersClear && transparentShare > 0.02,
    transparentShare,
    trimmed: opts.trim,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
