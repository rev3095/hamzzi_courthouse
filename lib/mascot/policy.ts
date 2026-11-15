// 마스코트 편집기(/studio, 개발 전용) 순수 규칙: 접근 허용, webp 검사, 상태 그림·되돌리기 기록 전이.
// 파일·디스크 접근은 store.ts. 화면에서 쓰는 상태 목록은 moods.ts.
import { MASCOT_SIZE, type MascotManifest, type MascotMood } from "./moods";

/** 저장하는 그림 한 장의 최대 크기 (480×635 webp는 보통 50~150KB) */
export const MAX_MASCOT_BYTES = 800 * 1024;
/** 상태마다 되돌리기 기록을 몇 개까지 두는지 */
export const HISTORY_LIMIT = 10;

const FILE_RE = /^[a-z]+-[0-9a-f]{8}\.webp$/;

/** 편집기가 쓰는 파일 이름. 내용 해시를 넣어 바꿀 때마다 주소가 달라진다 (이미지 캐시 문제 없음) */
export function moodFileName(mood: MascotMood, hash: string): string {
  return `${mood}-${hash.slice(0, 8)}.webp`;
}

export function isMoodFileName(name: string): boolean {
  return FILE_RE.test(name);
}

// ---------- 접근 ----------

export type StudioRequestInfo = {
  nodeEnv: string | undefined;
  method: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
};

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * 편집기 API를 받아도 되는지. 개발 서버(`pnpm dev`)에서, 이 컴퓨터 주소로, 같은 사이트 화면에서 보낸 요청만 허용한다.
 * 배포(production)에서는 항상 거절 → 404. 다른 사이트가 브라우저를 통해 몰래 보내는 쓰기 요청도 거절한다.
 */
export function studioAllowed(r: StudioRequestInfo): boolean {
  if (r.nodeEnv !== "development") return false;
  if (!r.host || !LOCAL_HOST.test(r.host)) return false;
  if (r.method === "GET" || r.method === "HEAD") return true;
  if (r.secFetchSite && r.secFetchSite !== "same-origin") return false;
  if (!r.origin) return r.secFetchSite === "same-origin";
  try {
    return new URL(r.origin).host === r.host;
  } catch {
    return false;
  }
}

// ---------- webp 검사 ----------

export type WebpInfo = { width: number; height: number; alpha: boolean };

const ascii = (b: Uint8Array, at: number) =>
  String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

/** RIFF/WEBP 머리만 읽어 크기·투명 여부를 돌려준다. webp가 아니면 null */
export function webpInfo(b: Uint8Array): WebpInfo | null {
  if (b.length < 30 || ascii(b, 0) !== "RIFF" || ascii(b, 8) !== "WEBP") return null;
  const chunk = ascii(b, 12);
  if (chunk === "VP8X") {
    const width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { width, height, alpha: (b[20] & 0x10) !== 0 };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      alpha: ((bits >>> 28) & 1) === 1,
    };
  }
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return {
      width: (b[26] | (b[27] << 8)) & 0x3fff,
      height: (b[28] | (b[29] << 8)) & 0x3fff,
      alpha: false,
    };
  }
  return null;
}

export type UploadProblem = "not_webp" | "too_large" | "wrong_size";

/** 저장 전 서버 검사. 편집기 화면이 480×635 webp로 바꿔 보내므로 그 형식만 받는다 */
export function checkMascotUpload(b: Uint8Array): UploadProblem | null {
  if (b.length > MAX_MASCOT_BYTES) return "too_large";
  const info = webpInfo(b);
  if (!info) return "not_webp";
  if (info.width !== MASCOT_SIZE.width || info.height !== MASCOT_SIZE.height) return "wrong_size";
  return null;
}

// ---------- 상태 그림 · 되돌리기 기록 ----------

/** 되돌리기 기록 한 칸 = 바꾸기 직전의 그림 (null이면 그때는 기본 그림을 쓰고 있었다) */
export type HistoryEntry = { file: string | null; at: string };
export type MascotHistory = Partial<Record<MascotMood, HistoryEntry[]>>;
export type StudioState = { manifest: MascotManifest; history: MascotHistory };

/** 상태 바꾸기 결과. 파일 정리는 store가 한다: keep = 기록 폴더로 옮길 파일, drop = 지울 파일, restore = 기록에서 되살릴 파일 */
export type Transition = {
  next: StudioState;
  keep?: string;
  drop: string[];
  restore?: string;
};

function withFile(m: MascotManifest, mood: MascotMood, file: string | null): MascotManifest {
  const files = { ...m.files };
  if (file) files[mood] = file;
  else delete files[mood];
  return { ...m, files };
}

function pushHistory(h: MascotHistory, mood: MascotMood, entry: HistoryEntry) {
  const list = [entry, ...(h[mood] ?? [])];
  const kept = list.slice(0, HISTORY_LIMIT);
  const dropped = list
    .slice(HISTORY_LIMIT)
    .map((e) => e.file)
    .filter((f): f is string => !!f);
  return { history: { ...h, [mood]: kept }, dropped };
}

/** 새 그림 저장: 지금 그림은 기록으로 옮긴다 */
export function applyUpload(
  s: StudioState,
  mood: MascotMood,
  file: string,
  at: string,
): Transition {
  const current = s.manifest.files[mood] ?? null;
  if (current === file) return { next: s, drop: [] };
  const { history, dropped } = pushHistory(s.history, mood, { file: current, at });
  return {
    next: { manifest: withFile(s.manifest, mood, file), history },
    ...(current && { keep: current }),
    drop: dropped,
  };
}

/** 기본 그림으로: 이 상태 전용 그림을 빼고(기록에 남김) 기본 그림을 쓴다 */
export function applyReset(s: StudioState, mood: MascotMood, at: string): Transition | null {
  const current = s.manifest.files[mood];
  if (!current) return null;
  const { history, dropped } = pushHistory(s.history, mood, { file: current, at });
  return {
    next: { manifest: withFile(s.manifest, mood, null), history },
    keep: current,
    drop: dropped,
  };
}

/** 되돌리기: 기록의 맨 앞(바로 전 그림)으로 돌아간다. 지금 그림은 지운다 */
export function applyUndo(s: StudioState, mood: MascotMood): Transition | null {
  const [prev, ...rest] = s.history[mood] ?? [];
  if (!prev) return null;
  const current = s.manifest.files[mood] ?? null;
  return {
    next: {
      manifest: withFile(s.manifest, mood, prev.file),
      history: { ...s.history, [mood]: rest },
    },
    drop: current && current !== prev.file ? [current] : [],
    ...(prev.file && { restore: prev.file }),
  };
}
