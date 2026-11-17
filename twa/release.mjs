// Android 앱(TWA) 버전 관리·빌드 도구 (docs/08_Google_Play_배포.md 3.3절)
//
//   pnpm android:version                      현재 버전 보기 + twa-manifest.json ↔ app/build.gradle 일치 검사
//   pnpm android:bump patch "변경 내용"         버전 올리기 (patch|minor|major) + CHANGELOG.md 기록
//   pnpm android:build                        검사 → Gradle 빌드 → twa/dist/에 버전 이름 붙여 복사
//
// 버전의 기준은 twa-manifest.json 한 곳이다 (appVersionCode = Play가 보는 정수, appVersion = 사용자에게 보이는 이름).
// appVersionCode는 Play에 한 번 올린 값을 다시 쓸 수 없으므로 내리거나 재사용하지 않는다.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TWA = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(TWA, "twa-manifest.json");
const GRADLE = path.join(TWA, "app", "build.gradle");
const CHANGELOG = path.join(TWA, "CHANGELOG.md");
const DIST = path.join(TWA, "dist");

const readManifest = () => JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

function readGradle() {
  const text = fs.readFileSync(GRADLE, "utf8");
  const code = text.match(/^\s*versionCode (\d+)\s*$/m);
  const name = text.match(/^\s*versionName "([^"]+)"\s*$/m);
  if (!code || !name)
    throw new Error("app/build.gradle에서 versionCode/versionName을 찾지 못했어요");
  return { text, code: Number(code[1]), name: name[1] };
}

function check() {
  const m = readManifest();
  const g = readGradle();
  console.log(`twa-manifest.json : ${m.appVersion} (versionCode ${m.appVersionCode})`);
  console.log(`app/build.gradle  : ${g.name} (versionCode ${g.code})`);
  if (m.appVersionCode !== g.code || m.appVersion !== g.name) {
    console.error(
      "버전이 서로 달라요. `pnpm android:bump`로 올리거나, bubblewrap update 뒤라면 --skipVersionUpgrade를 썼는지 확인하세요.",
    );
    process.exit(1);
  }
  return m;
}

function bumpName(name, level) {
  const [major, minor, patch] = name.split(".").map(Number);
  if ([major, minor, patch].some((n) => !Number.isInteger(n))) {
    throw new Error(`appVersion "${name}"이 x.y.z 형식이 아니에요`);
  }
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  if (level === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error("올릴 단위는 patch, minor, major 중 하나예요");
}

function bump(level, note) {
  if (!note) throw new Error('변경 내용을 적어 주세요. 예: pnpm android:bump patch "아이콘 교체"');
  const m = check();
  const nextName = bumpName(m.appVersion, level);
  const nextCode = m.appVersionCode + 1;

  const raw = fs.readFileSync(MANIFEST, "utf8");
  fs.writeFileSync(
    MANIFEST,
    raw
      .replace(/("appVersion": )"[^"]+"/, `$1"${nextName}"`)
      .replace(/("appVersionCode": )\d+/, `$1${nextCode}`),
  );
  const g = readGradle();
  fs.writeFileSync(
    GRADLE,
    g.text
      .replace(/^(\s*versionCode )\d+(\s*)$/m, `$1${nextCode}$2`)
      .replace(/^(\s*versionName )"[^"]+"(\s*)$/m, `$1"${nextName}"$2`),
  );

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const log = fs.readFileSync(CHANGELOG, "utf8");
  const entry = `## ${nextName} (versionCode ${nextCode}) — ${today}\n- ${note}\n\n`;
  fs.writeFileSync(CHANGELOG, log.replace(/^## /m, `${entry}## `));

  check();
  console.log(`→ ${nextName} (versionCode ${nextCode}). 빌드: pnpm android:build`);
}

function build() {
  const m = check();
  const env = { ...process.env };
  if (!env.ANDROID_HOME && process.platform === "win32" && env.LOCALAPPDATA) {
    env.ANDROID_HOME = path.join(env.LOCALAPPDATA, "Android", "Sdk");
  }
  const win = process.platform === "win32";
  const gradlew = win ? `"${path.join(TWA, "gradlew.bat")}"` : "./gradlew";
  const tasks = "assembleDebug bundleRelease";
  // Windows는 .bat을 셸로만 실행할 수 있어 명령을 한 문자열로 넘긴다(인자에 사용자 입력 없음)
  const r = win
    ? spawnSync(`${gradlew} ${tasks}`, { cwd: TWA, env, stdio: "inherit", shell: true })
    : spawnSync(gradlew, tasks.split(" "), { cwd: TWA, env, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);

  fs.mkdirSync(DIST, { recursive: true });
  const tag = `hamzzi-court-${m.appVersion}-vc${m.appVersionCode}`;
  const out = [
    ["app/build/outputs/bundle/release/app-release.aab", `${tag}-unsigned.aab`],
    ["app/build/outputs/apk/debug/app-debug.apk", `${tag}-debug.apk`],
  ];
  for (const [from, to] of out) {
    fs.copyFileSync(path.join(TWA, from), path.join(DIST, to));
    console.log(`twa/dist/${to}`);
  }
  console.log(`다음: AAB 서명 → Play 업로드 → git tag android-v${m.appVersion} (docs/08 3.3절)`);
}

const [cmd = "check", ...args] = process.argv.slice(2);
try {
  if (cmd === "check") check();
  else if (cmd === "bump") bump(args[0], args.slice(1).join(" "));
  else if (cmd === "build") build();
  else throw new Error(`모르는 명령: ${cmd} (check | bump | build)`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
