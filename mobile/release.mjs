// 햄찌법원 앱(Capacitor, DEC-048) 버전 관리·빌드 도구
//
//   pnpm app:version                     버전 보기 + app-version.json ↔ Android·iOS 프로젝트 일치 검사
//   pnpm app:bump patch "변경 내용"        버전 올리기 (patch|minor|major) + CHANGELOG.md 기록 + 네이티브 프로젝트에 반영
//   pnpm app:sync                        화면 빌드(vite) → Android·iOS에 복사(cap sync) → 버전 다시 반영
//   pnpm app:apk                         app:sync → Gradle로 디버그 APK + 서명 전 AAB → mobile/out/에 버전 이름 붙여 복사
//
// 버전의 기준은 app-version.json 한 곳이다. versionCode는 Play·App Store에 한 번 올린 값을 다시 쓸 수 없어 내리지 않는다.
// iOS 번들 ID는 Apple이 밑줄을 받지 않아 Android 패키지와 다르게 둔다 (IOS_BUNDLE_ID).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(APP);
const VERSION = path.join(APP, "app-version.json");
const PKG = path.join(APP, "package.json");
const GRADLE = path.join(APP, "android", "app", "build.gradle");
const PBX = path.join(APP, "ios", "App", "App.xcodeproj", "project.pbxproj");
const CHANGELOG = path.join(APP, "CHANGELOG.md");
const OUT = path.join(APP, "out");
const IOS_BUNDLE_ID = "app.vercel.hamzzi-courthouse";

const readVersion = () => JSON.parse(fs.readFileSync(VERSION, "utf8"));

function nativeVersions() {
  const g = fs.readFileSync(GRADLE, "utf8");
  const p = fs.existsSync(PBX) ? fs.readFileSync(PBX, "utf8") : "";
  return {
    androidCode: Number(g.match(/^\s*versionCode (\d+)\s*$/m)?.[1]),
    androidName: g.match(/^\s*versionName "([^"]+)"\s*$/m)?.[1],
    iosCodes: [...p.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1]),
    iosNames: [...p.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]),
    iosIds: [...p.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]),
  };
}

/** app-version.json 값을 Android·iOS 프로젝트와 mobile/package.json에 쓴다 */
function apply() {
  const v = readVersion();
  const g = fs.readFileSync(GRADLE, "utf8");
  fs.writeFileSync(
    GRADLE,
    g
      .replace(/^(\s*versionCode )\d+(\s*)$/m, `$1${v.versionCode}$2`)
      .replace(/^(\s*versionName )"[^"]+"(\s*)$/m, `$1"${v.versionName}"$2`),
  );
  if (fs.existsSync(PBX)) {
    const p = fs.readFileSync(PBX, "utf8");
    fs.writeFileSync(
      PBX,
      p
        .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${v.versionCode};`)
        .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${v.versionName};`)
        .replace(
          /PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,
          `PRODUCT_BUNDLE_IDENTIFIER = ${IOS_BUNDLE_ID};`,
        ),
    );
  }
  const pkg = fs.readFileSync(PKG, "utf8");
  fs.writeFileSync(PKG, pkg.replace(/("version": )"[^"]+"/, `$1"${v.versionName}"`));
}

function check() {
  const v = readVersion();
  const n = nativeVersions();
  console.log(`app-version.json : ${v.versionName} (versionCode ${v.versionCode})`);
  console.log(`Android          : ${n.androidName} (versionCode ${n.androidCode})`);
  console.log(
    `iOS              : ${n.iosNames.join(", ")} (build ${n.iosCodes.join(", ")}) · ${n.iosIds[0] ?? "-"}`,
  );
  const ok =
    n.androidCode === v.versionCode &&
    n.androidName === v.versionName &&
    n.iosCodes.every((c) => c === String(v.versionCode)) &&
    n.iosNames.every((x) => x === v.versionName) &&
    n.iosIds.every((x) => x === IOS_BUNDLE_ID);
  if (!ok) {
    console.error(
      "버전이 서로 달라요. `pnpm app:sync`(cap sync 뒤 다시 반영) 또는 `pnpm app:bump`를 쓰세요.",
    );
    process.exit(1);
  }
  return v;
}

function bumpName(name, level) {
  const [major, minor, patch] = name.split(".").map(Number);
  if ([major, minor, patch].some((x) => !Number.isInteger(x)))
    throw new Error(`versionName "${name}"이 x.y.z 형식이 아니에요`);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  if (level === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error("올릴 단위는 patch, minor, major 중 하나예요");
}

function bump(level, note) {
  if (!note) throw new Error('변경 내용을 적어 주세요. 예: pnpm app:bump patch "판독 낱말 보강"');
  const v = check();
  const next = {
    ...v,
    versionName: bumpName(v.versionName, level),
    versionCode: v.versionCode + 1,
  };
  fs.writeFileSync(VERSION, JSON.stringify(next, null, 2) + "\n");
  apply();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const log = fs.readFileSync(CHANGELOG, "utf8");
  const entry = `## ${next.versionName} (versionCode ${next.versionCode}) — ${today}\n- ${note}\n\n`;
  fs.writeFileSync(CHANGELOG, log.replace(/^## /m, `${entry}## `));
  check();
  console.log(`→ ${next.versionName} (versionCode ${next.versionCode}). 빌드: pnpm app:apk`);
}

const win = process.platform === "win32";
function run(cmd, args, cwd, env = process.env) {
  // Windows는 .cmd·.bat을 셸로만 실행할 수 있어 한 문자열로 넘긴다 (인자에 사용자 입력 없음)
  const r = win
    ? spawnSync([cmd, ...args].join(" "), { cwd, env, stdio: "inherit", shell: true })
    : spawnSync(cmd, args, { cwd, env, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function sync() {
  run("pnpm", ["exec", "vite", "build", "--config", "mobile/vite.config.ts"], ROOT);
  run("pnpm", ["exec", "cap", "sync"], APP);
  apply();
  check();
}

function apk() {
  sync();
  const v = readVersion();
  const env = { ...process.env };
  if (!env.ANDROID_HOME && win && env.LOCALAPPDATA)
    env.ANDROID_HOME = path.join(env.LOCALAPPDATA, "Android", "Sdk");
  const android = path.join(APP, "android");
  run(
    win ? `"${path.join(android, "gradlew.bat")}"` : "./gradlew",
    ["assembleDebug", "bundleRelease"],
    android,
    env,
  );
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `hamzzi-court-app-${v.versionName}-vc${v.versionCode}`;
  for (const [from, to] of [
    ["app/build/outputs/apk/debug/app-debug.apk", `${tag}-debug.apk`],
    ["app/build/outputs/bundle/release/app-release.aab", `${tag}-unsigned.aab`],
  ]) {
    fs.copyFileSync(path.join(android, from), path.join(OUT, to));
    console.log(`mobile/out/${to}`);
  }
  console.log(
    `다음: 디버그 APK로 기기 확인 → AAB 서명 → Play 업로드 → git tag app-v${v.versionName}`,
  );
}

const [cmd = "check", ...args] = process.argv.slice(2);
try {
  if (cmd === "check") check();
  else if (cmd === "apply") (apply(), check());
  else if (cmd === "bump") bump(args[0], args.slice(1).join(" "));
  else if (cmd === "sync") sync();
  else if (cmd === "apk") apk();
  else throw new Error(`모르는 명령: ${cmd} (check | apply | bump | sync | apk)`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
