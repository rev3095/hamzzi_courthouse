"use client";
// 조회 이력 (DEC-029 제안). 열어 본 판례·조문·결정문·자치법규의 제목과 주소만 이 기기(localStorage)에 둔다.
// 검색어·질문은 담지 않는다 — 공개 자료의 이름뿐이다 (F-007). 서버로 보내지 않고, '내 기록 삭제'와 '지우기'로 없앤다.
import { useEffect, useSyncExternalStore } from "react";

export type RecentItem = { href: string; title: string; sub: string; kind: string; at: number };

const KEY = "hz:recent";
const EVENT = "hz:recent";
const MAX = 20;

let cache: { raw: string | null; items: RecentItem[] } = { raw: null, items: [] };
const EMPTY: RecentItem[] = [];

function read(): RecentItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.items;
  let items: RecentItem[] = [];
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    if (Array.isArray(v)) {
      items = v.filter(
        (x): x is RecentItem =>
          !!x &&
          typeof x.href === "string" &&
          x.href.startsWith("/") &&
          typeof x.title === "string" &&
          typeof x.sub === "string" &&
          typeof x.kind === "string",
      );
    }
  } catch {
    items = [];
  }
  cache = { raw, items };
  return items;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function addRecent(item: Omit<RecentItem, "at">) {
  try {
    const next = [
      { ...item, title: item.title.slice(0, 120), sub: item.sub.slice(0, 120), at: Date.now() },
      ...read().filter((r) => r.href !== item.href),
    ].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // 저장소를 못 쓰면 이력만 빠진다
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // 지울 것이 없다
  }
}

export function useRecent(): RecentItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** 상세 화면이 열렸을 때 한 번 기록한다 */
export function useRecordRecent(item: Omit<RecentItem, "at"> | null) {
  const key = item ? `${item.href}|${item.title}` : null;
  useEffect(() => {
    if (item) addRecent(item);
    // 같은 자료는 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
