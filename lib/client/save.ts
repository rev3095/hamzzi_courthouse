"use client";
// 내 기록에 남기기 (DEC-039): 로그인 사용자가 질문마다 고르는 선택. 이 기기에만 기억하고 기본은 남기지 않음.
// 로그인 자체는 lib/client/login.ts (Google 전용, DEC-035).
import { useSyncExternalStore } from "react";
import { GOOGLE_LOGIN_ENABLED } from "./login";

const SAVE_KEY = "hz:save";
const SAVE_EVENT = "hz:save";

export function readSave(): boolean {
  try {
    return GOOGLE_LOGIN_ENABLED && localStorage.getItem(SAVE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSave(on: boolean) {
  try {
    if (on) localStorage.setItem(SAVE_KEY, "1");
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // 저장소를 못 쓰면 남기지 않는 쪽으로 동작한다
  }
  window.dispatchEvent(new Event(SAVE_EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener(SAVE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(SAVE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useSave(): boolean {
  return useSyncExternalStore(subscribe, readSave, () => false);
}
