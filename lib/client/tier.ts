"use client";
// 답변 단계 선택 (DEC-036). 이 기기에만 기억한다 — 개인정보가 아닌 정해진 세 값 중 하나.
// 질문창의 선택기(components/ask/TierSlider)와 분석 요청(lib/client/api analyzeStream)이 같은 값을 본다.
import { useSyncExternalStore } from "react";
import { DEFAULT_TIER, isTierId, type TierId } from "@/lib/ai/models";

const KEY = "hz:tier";
const EVENT = "hz:tier";

export function readTier(): TierId {
  try {
    const v = localStorage.getItem(KEY);
    return isTierId(v) ? v : DEFAULT_TIER;
  } catch {
    return DEFAULT_TIER;
  }
}

export function writeTier(tier: TierId) {
  try {
    localStorage.setItem(KEY, tier);
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 기본값으로 동작한다
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useTier(): TierId {
  return useSyncExternalStore(subscribe, readTier, () => DEFAULT_TIER);
}
