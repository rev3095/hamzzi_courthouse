// 마스코트 편집기 파일 저장 (개발 전용, server-only). 배포에서는 라우트가 먼저 404로 막는다.
// 지금 그림: public/mascot/moods/<상태>-<해시>.webp + lib/mascot/manifest.json (커밋 대상)
// 되돌리기 기록: .studio/mascot-history/ + .studio/mascot-history.json (gitignore, 이 컴퓨터에만)
import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MASCOT_MOODS, MOOD_DIR, type MascotManifest, type MascotMood } from "./moods";
import {
  applyReset,
  applyUndo,
  applyUpload,
  isMoodFileName,
  moodFileName,
  type MascotHistory,
  type StudioState,
  type Transition,
} from "./policy";

// 경로는 이 함수 한 곳에서만 만든다. 개발 전용이라 배포 번들 추적에서 뺀다 (전체 프로젝트가 서버 번들에 들어가는 것 방지)
const at = (...parts: string[]) => path.join(/*turbopackIgnore: true*/ process.cwd(), ...parts);
const paths = () => ({
  manifest: at("lib", "mascot", "manifest.json"),
  current: at("public", ...MOOD_DIR.split("/").filter(Boolean)),
  historyDir: at(".studio", "mascot-history"),
  historyLog: at(".studio", "mascot-history.json"),
});
const inDir = (dir: string, file: string) => `${dir}${path.sep}${file}`;

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function loadStudio(): Promise<StudioState> {
  const p = paths();
  const manifest = await readJsonFile<MascotManifest>(p.manifest, { files: {} });
  const rawHistory = await readJsonFile<MascotHistory>(p.historyLog, {});
  // 파일에서 읽은 이름도 형식을 다시 확인한다 (../ 같은 이름으로 프로젝트 밖 파일을 옮기거나 지우지 않게)
  const files: MascotManifest["files"] = {};
  const faces: NonNullable<MascotManifest["faces"]> = {};
  const history: MascotHistory = {};
  for (const mood of MASCOT_MOODS) {
    const f = manifest.files?.[mood];
    if (f && isMoodFileName(f)) files[mood] = f;
    // 얼굴은 편집기가 바꾸지 않지만 manifest를 다시 쓸 때 지우지 않게 그대로 둔다
    const face = manifest.faces?.[mood];
    if (face && isMoodFileName(face)) faces[mood] = face;
    const list = rawHistory[mood];
    if (Array.isArray(list))
      history[mood] = list.filter((e) => e && (e.file === null || isMoodFileName(e.file)));
  }
  return { manifest: { files, ...(Object.keys(faces).length > 0 && { faces }) }, history };
}

/** 지금 그림·기록에서 아직 쓰는 파일 이름 */
function referenced(s: StudioState): Set<string> {
  const used = new Set<string>(Object.values(s.manifest.files).filter(Boolean) as string[]);
  for (const mood of MASCOT_MOODS)
    for (const e of s.history[mood] ?? []) if (e.file) used.add(e.file);
  return used;
}

async function move(from: string, to: string) {
  try {
    await rename(from, to);
  } catch {
    // 이미 옮겨졌거나 없으면 그대로 둔다 (기록은 state가 기준)
  }
}

async function commit(t: Transition): Promise<StudioState> {
  const p = paths();
  await mkdir(p.current, { recursive: true });
  await mkdir(p.historyDir, { recursive: true });
  await mkdir(path.dirname(p.manifest), { recursive: true });
  if (t.keep) await move(inDir(p.current, t.keep), inDir(p.historyDir, t.keep));
  if (t.restore) await move(inDir(p.historyDir, t.restore), inDir(p.current, t.restore));
  const still = referenced(t.next);
  for (const f of t.drop) {
    if (still.has(f)) continue;
    await rm(inDir(p.current, f), { force: true });
    await rm(inDir(p.historyDir, f), { force: true });
  }
  await writeFile(p.manifest, JSON.stringify(t.next.manifest, null, 2) + "\n", "utf8");
  await writeFile(p.historyLog, JSON.stringify(t.next.history, null, 2) + "\n", "utf8");
  return t.next;
}

export async function saveMoodImage(mood: MascotMood, bytes: Uint8Array): Promise<StudioState> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const file = moodFileName(mood, hash);
  const p = paths();
  await mkdir(p.current, { recursive: true });
  await writeFile(inDir(p.current, file), bytes);
  return commit(applyUpload(await loadStudio(), mood, file, new Date().toISOString()));
}

export async function resetMood(mood: MascotMood): Promise<StudioState | null> {
  const t = applyReset(await loadStudio(), mood, new Date().toISOString());
  return t ? commit(t) : null;
}

export async function undoMood(mood: MascotMood): Promise<StudioState | null> {
  const t = applyUndo(await loadStudio(), mood);
  return t ? commit(t) : null;
}

/** 기록 그림 미리보기 (편집기 썸네일). 이름 형식이 아니면 null */
export async function readHistoryImage(name: string): Promise<Uint8Array | null> {
  if (!isMoodFileName(name)) return null;
  try {
    return new Uint8Array(await readFile(inDir(paths().historyDir, name)));
  } catch {
    return null;
  }
}
