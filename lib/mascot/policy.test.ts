import { describe, expect, it } from "vitest";
import { DEFAULT_MASCOT_SRC, mascotSrc, moodForError } from "./moods";
import {
  applyReset,
  applyUndo,
  applyUpload,
  checkMascotUpload,
  HISTORY_LIMIT,
  isMoodFileName,
  MAX_MASCOT_BYTES,
  moodFileName,
  studioAllowed,
  webpInfo,
  type StudioState,
} from "./policy";

// RIFF/WEBP 머리만 있는 가짜 파일 (검사기는 머리만 읽는다)
function riff(chunk: string, body: number[]): Uint8Array {
  const b = new Uint8Array(40);
  b.set(
    [..."RIFF"].map((c) => c.charCodeAt(0)),
    0,
  );
  b.set(
    [..."WEBP"].map((c) => c.charCodeAt(0)),
    8,
  );
  b.set(
    [...chunk].map((c) => c.charCodeAt(0)),
    12,
  );
  b.set(body, 20);
  return b;
}
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const vp8x = (w: number, h: number, alpha = true) =>
  riff("VP8X", [alpha ? 0x10 : 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);
function vp8l(w: number, h: number, alpha: boolean) {
  const bits = ((w - 1) | ((h - 1) << 14) | ((alpha ? 1 : 0) << 28)) >>> 0;
  return riff("VP8L", [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, bits >>> 24]);
}
const vp8 = (w: number, h: number) =>
  riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, w & 255, w >> 8, h & 255, h >> 8]);

describe("마스코트 상태 그림", () => {
  it("상태 그림이 없으면 기본 그림, 기본 상태 그림이 있으면 그것으로 대체한다", () => {
    expect(mascotSrc("error", { files: {} })).toBe(DEFAULT_MASCOT_SRC);
    expect(mascotSrc("error", { files: { error: "error-1234abcd.webp" } })).toBe(
      "/mascot/moods/error-1234abcd.webp",
    );
    expect(mascotSrc("sorry", { files: { default: "default-1234abcd.webp" } })).toBe(
      "/mascot/moods/default-1234abcd.webp",
    );
  });

  it("오류 코드별 상태: 연결·서버 문제는 오류, 한도는 답변이 어려움, 가린 문장 확인은 재질문", () => {
    expect(moodForError("SEARCH_UPSTREAM_FAILED")).toBe("error");
    expect(moodForError("MODEL_FAILED")).toBe("error");
    expect(moodForError("TIMEOUT")).toBe("error");
    expect(moodForError("INTERNAL_ERROR")).toBe("error");
    expect(moodForError("RATE_LIMITED")).toBe("sorry");
    expect(moodForError("LOGIN_REQUIRED")).toBe("sorry");
    expect(moodForError("PII_CONFIRMATION_REQUIRED")).toBe("ask");
  });
});

describe("webp 검사", () => {
  it("VP8X·VP8L·VP8 머리에서 크기와 투명 여부를 읽는다", () => {
    expect(webpInfo(vp8x(480, 635))).toEqual({ width: 480, height: 635, alpha: true });
    expect(webpInfo(vp8l(480, 635, true))).toEqual({ width: 480, height: 635, alpha: true });
    expect(webpInfo(vp8(480, 635))).toEqual({ width: 480, height: 635, alpha: false });
  });

  it("webp가 아니거나 크기가 다르거나 너무 크면 거절한다", () => {
    const png = new Uint8Array(40);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    expect(checkMascotUpload(png)).toBe("not_webp");
    expect(checkMascotUpload(vp8x(1920, 1920))).toBe("wrong_size");
    const big = new Uint8Array(MAX_MASCOT_BYTES + 1);
    big.set(vp8x(480, 635));
    expect(checkMascotUpload(big)).toBe("too_large");
    expect(checkMascotUpload(vp8x(480, 635))).toBeNull();
  });

  it("파일 이름은 상태-해시8.webp 형식만 쓴다 (경로 조작 차단)", () => {
    expect(moodFileName("error", "0123456789abcdef")).toBe("error-01234567.webp");
    expect(isMoodFileName("error-01234567.webp")).toBe(true);
    expect(isMoodFileName("../manifest.json")).toBe(false);
    expect(isMoodFileName("error-01234567.webp/../x")).toBe(false);
  });
});

describe("편집기 접근", () => {
  const base = {
    nodeEnv: "development",
    method: "POST",
    host: "localhost:3000",
    origin: "http://localhost:3000",
    secFetchSite: "same-origin",
  };
  it("개발 서버의 같은 사이트 요청만 허용한다", () => {
    expect(studioAllowed(base)).toBe(true);
    expect(studioAllowed({ ...base, method: "GET", origin: null, secFetchSite: null })).toBe(true);
  });
  it("배포(production)에서는 모두 거절한다", () => {
    expect(studioAllowed({ ...base, nodeEnv: "production" })).toBe(false);
    expect(studioAllowed({ ...base, nodeEnv: "production", method: "GET" })).toBe(false);
  });
  it("다른 주소·다른 사이트에서 보낸 쓰기 요청은 거절한다", () => {
    expect(studioAllowed({ ...base, host: "hamzzi-courthouse.vercel.app" })).toBe(false);
    expect(studioAllowed({ ...base, host: "192.168.0.5:3000" })).toBe(false);
    expect(
      studioAllowed({ ...base, origin: "https://evil.example", secFetchSite: "cross-site" }),
    ).toBe(false);
    expect(studioAllowed({ ...base, origin: "https://evil.example", secFetchSite: null })).toBe(
      false,
    );
    expect(studioAllowed({ ...base, origin: null, secFetchSite: null })).toBe(false);
  });
});

describe("저장·기본 그림으로·되돌리기", () => {
  const empty: StudioState = { manifest: { files: {} }, history: {} };
  const at = "2026-11-15T00:00:00.000Z";

  it("저장하면 바로 전 그림이 기록에 남고, 되돌리면 그 그림으로 돌아간다", () => {
    const a = applyUpload(empty, "error", "error-aaaaaaaa.webp", at);
    expect(a.next.manifest.files.error).toBe("error-aaaaaaaa.webp");
    expect(a.next.history.error).toEqual([{ file: null, at }]);
    expect(a.keep).toBeUndefined();

    const b = applyUpload(a.next, "error", "error-bbbbbbbb.webp", at);
    expect(b.keep).toBe("error-aaaaaaaa.webp");
    expect(b.next.history.error?.[0].file).toBe("error-aaaaaaaa.webp");

    const u = applyUndo(b.next, "error")!;
    expect(u.next.manifest.files.error).toBe("error-aaaaaaaa.webp");
    expect(u.restore).toBe("error-aaaaaaaa.webp");
    expect(u.drop).toEqual(["error-bbbbbbbb.webp"]);

    const u2 = applyUndo(u.next, "error")!;
    expect(u2.next.manifest.files.error).toBeUndefined();
    expect(applyUndo(u2.next, "error")).toBeNull();
  });

  it("기본 그림으로 바꾸면 전용 그림을 빼고, 되돌리기로 다시 살릴 수 있다", () => {
    const a = applyUpload(empty, "sorry", "sorry-aaaaaaaa.webp", at);
    expect(applyReset(empty, "sorry", at)).toBeNull();
    const r = applyReset(a.next, "sorry", at)!;
    expect(r.next.manifest.files.sorry).toBeUndefined();
    expect(r.keep).toBe("sorry-aaaaaaaa.webp");
    const u = applyUndo(r.next, "sorry")!;
    expect(u.next.manifest.files.sorry).toBe("sorry-aaaaaaaa.webp");
  });

  it(`기록은 상태마다 ${HISTORY_LIMIT}개까지 두고 오래된 그림 파일은 지운다`, () => {
    let s = empty;
    const drops: string[] = [];
    for (let i = 0; i <= HISTORY_LIMIT + 1; i++) {
      const t = applyUpload(s, "ask", `ask-${String(i).padStart(8, "0")}.webp`, at);
      drops.push(...t.drop);
      s = t.next;
    }
    expect(s.history.ask).toHaveLength(HISTORY_LIMIT);
    expect(drops).toEqual(["ask-00000000.webp"]);
  });
});
