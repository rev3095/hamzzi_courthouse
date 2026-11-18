"use client";
// 이 브라우저에만 두는 화면 설정 (DEC-032). 로그인이 없어 서버에 저장하지 않고 localStorage에 켜짐/꺼짐 값만 둔다.
// 저장소를 못 쓰는 환경(사생활 보호 창·차단)에서는 기본값(켜짐)으로 동작한다.
// 같은 화면 안(마이페이지 → 레이아웃의 챗봇)은 사용자 정의 이벤트로, 다른 탭은 storage 이벤트로 바로 맞춘다.
import { useSyncExternalStore } from "react";

/** 햄찌 안내 챗봇 표시 여부. 값은 "off"일 때만 꺼짐 */
export const GUIDE_BOT_KEY = "hz:guidebot";
const EVENT = "hz:prefs";

function read(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_BOT_KEY) !== "off";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => e.key === GUIDE_BOT_KEY && onChange();
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** 햄찌 안내 챗봇을 보여 줄지. 서버 렌더·첫 그림은 켜짐으로 맞춘다(하이드레이션 불일치 방지) */
export function useGuideBotEnabled(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

export function setGuideBotEnabled(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(GUIDE_BOT_KEY);
    else window.localStorage.setItem(GUIDE_BOT_KEY, "off");
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 바뀌지 않는다 — 기본값(켜짐) 유지
  }
  window.dispatchEvent(new Event(EVENT));
}
