import type { CapacitorConfig } from "@capacitor/cli";

// 앱 화면(dist)을 그대로 Android·iOS 앱에 싣는다 (DEC-048). 원격 사이트를 띄우지 않는다 — 인터넷 없이 열린다.
// appId는 Play에 처음 올린 뒤 바꿀 수 없다. Android는 사용자가 확정한 이름, iOS 번들 ID는 ios 프로젝트에서 따로 정한다(밑줄 불가).
const config: CapacitorConfig = {
  appId: "app.vercel.hamzzi_courthouse.twa",
  appName: "햄찌법원",
  webDir: "dist",
  backgroundColor: "#faf9f6",
  android: { allowMixedContent: false },
};

export default config;
