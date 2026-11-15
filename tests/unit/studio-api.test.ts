// @vitest-environment node
// 햄찌법원 편집기(/studio, 개발 전용) 마스코트 API — 배포·다른 사이트 요청 차단, 저장 검사, 파일 저장·되돌리기.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { GET, POST } = await import("@/app/api/dev/studio/mascot/route");
const store = await import("@/lib/mascot/store");

// 480×635 투명 webp 머리 (검사기는 머리만 읽는다)
function fakeWebp(seed = 0): Uint8Array {
  const b = new Uint8Array(64);
  b.set(
    [..."RIFF"].map((c) => c.charCodeAt(0)),
    0,
  );
  b.set(
    [..."WEBP"].map((c) => c.charCodeAt(0)),
    8,
  );
  b.set(
    [..."VP8X"].map((c) => c.charCodeAt(0)),
    12,
  );
  b[20] = 0x10;
  const w = 479,
    h = 634;
  b.set([w & 255, (w >> 8) & 255, 0, h & 255, (h >> 8) & 255, 0], 24);
  b[40] = seed;
  return b;
}

const local = {
  host: "localhost:3000",
  origin: "http://localhost:3000",
  "sec-fetch-site": "same-origin",
};
const req = (init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request("http://localhost:3000/api/dev/studio/mascot", {
    ...init,
    headers: { ...local, ...init.headers },
  });

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "hz-studio-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  vi.stubEnv("NODE_ENV", "development");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("편집기 API 접근", () => {
  test("배포(production)에서는 읽기·쓰기 모두 404", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET(req(), {})).status).toBe(404);
    const form = new FormData();
    form.set("mood", "error");
    form.set("file", new Blob([fakeWebp() as BlobPart]));
    expect((await POST(req({ method: "POST", body: form }), {})).status).toBe(404);
    await expect(readdir(dir)).resolves.toEqual([]);
  });

  test("다른 사이트에서 보낸 쓰기 요청은 404", async () => {
    const res = await POST(
      req({
        method: "POST",
        headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
        body: JSON.stringify({ action: "reset", mood: "error" }),
      }),
      {},
    );
    expect(res.status).toBe(404);
  });

  test("webp가 아니거나 크기가 다르면 400 VALIDATION_ERROR, 저장하지 않는다", async () => {
    const form = new FormData();
    form.set("mood", "error");
    form.set("file", new Blob([new Uint8Array(64)]));
    const res = await POST(req({ method: "POST", body: form }), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error.details).toEqual({ field: "file", reason: "not_webp" });
    const bad = new FormData();
    bad.set("mood", "angry");
    bad.set("file", new Blob([fakeWebp() as BlobPart]));
    expect((await POST(req({ method: "POST", body: bad }), {})).status).toBe(400);
  });
});

describe("상태 그림 저장·되돌리기 (실제 파일)", () => {
  test("저장 → 지금 그림·manifest 갱신, 다시 저장 → 이전 그림은 기록으로, 되돌리기·기본 그림으로", async () => {
    const save = async (seed: number) => {
      const form = new FormData();
      form.set("mood", "error");
      form.set("file", new Blob([fakeWebp(seed) as BlobPart]));
      return POST(req({ method: "POST", body: form }), {});
    };
    const r1 = await save(1);
    expect(r1.status).toBe(200);
    const v1 = (await r1.json()).data.moods.find((m: { mood: string }) => m.mood === "error");
    expect(v1.custom).toBe(true);
    expect(v1.src).toMatch(/^\/mascot\/moods\/error-[0-9a-f]{8}\.webp$/);
    const first = path.basename(v1.src);
    const manifest = JSON.parse(
      await readFile(path.join(dir, "lib", "mascot", "manifest.json"), "utf8"),
    );
    expect(manifest).toEqual({ files: { error: first } });

    await save(2);
    expect(await readdir(path.join(dir, "public", "mascot", "moods"))).toHaveLength(1);
    expect(await readdir(path.join(dir, ".studio", "mascot-history"))).toEqual([first]);
    expect(await store.readHistoryImage(first)).not.toBeNull();
    expect(await store.readHistoryImage("../manifest.json")).toBeNull();

    const undo = await POST(
      req({ method: "POST", body: JSON.stringify({ action: "undo", mood: "error" }) }),
      {},
    );
    const v2 = (await undo.json()).data.moods.find((m: { mood: string }) => m.mood === "error");
    expect(v2.src).toBe(`/mascot/moods/${first}`);
    expect(await readdir(path.join(dir, "public", "mascot", "moods"))).toEqual([first]);

    const reset = await POST(
      req({ method: "POST", body: JSON.stringify({ action: "reset", mood: "error" }) }),
      {},
    );
    const v3 = (await reset.json()).data.moods.find((m: { mood: string }) => m.mood === "error");
    expect(v3).toMatchObject({ custom: false, src: "/mascot/hamzzi-judge.webp" });
    expect(await readdir(path.join(dir, "public", "mascot", "moods"))).toEqual([]);

    // 더 되돌릴 것이 없으면 409
    await POST(
      req({ method: "POST", body: JSON.stringify({ action: "undo", mood: "error" }) }),
      {},
    );
    await POST(
      req({ method: "POST", body: JSON.stringify({ action: "undo", mood: "error" }) }),
      {},
    );
    const none = await POST(
      req({ method: "POST", body: JSON.stringify({ action: "undo", mood: "error" }) }),
      {},
    );
    expect(none.status).toBe(409);
    const view = (await (await GET(req(), {})).json()).data;
    expect(view.moods.find((m: { mood: string }) => m.mood === "error").custom).toBe(false);
  });
});
