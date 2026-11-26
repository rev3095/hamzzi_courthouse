// 비로그인 내 세션 (DEC-070 ②, 2026-11-27 사용자 요청): 로그인하지 않은 사람의 질문 세션 목록을 이 브라우저에만 둔다.
// 쿠키는 크기가 작아(4KB) localStorage를 쓴다(사용자 확인). 서버가 돌려준 가린 질문 문장(마스킹본)·질문 번호·시각·
// 사용자가 붙인 이름(가린 것)만 담고, 적은 원문은 담지 않는다. 질문·결과 자체는 서버에 그 브라우저의 익명 세션으로 있고,
// 여기서 지우면 목록에서만 빠진다. 로그인하면 계정의 내 세션(GET /me/inquiries)을 쓴다.
import { useSyncExternalStore } from "react";
import { scanInput } from "@/lib/pii";

export const LOCAL_SESSIONS_KEY = "hz:sessions";
const EVENT = "hz:sessions";
/** 이 브라우저에 두는 세션 수 (최근 것부터) */
export const LOCAL_SESSIONS_MAX = 100;
export const LOCAL_TITLE_MAX = 60;

export type LocalSession = { id: string; text: string; at: string; title: string | null };

const isSession = (v: unknown): v is LocalSession => {
  const s = v as LocalSession;
  return (
    !!s &&
    typeof s.id === "string" &&
    typeof s.text === "string" &&
    typeof s.at === "string" &&
    (s.title === null || typeof s.title === "string")
  );
};

/** 저장된 값을 읽는다. 모양이 다르면 버린다 */
export function parseLocalSessions(raw: string | null): LocalSession[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isSession).slice(0, LOCAL_SESSIONS_MAX) : [];
  } catch {
    return [];
  }
}

/** 새 세션을 맨 앞에. 같은 번호는 하나만 */
export function withSession(list: LocalSession[], s: LocalSession): LocalSession[] {
  return [s, ...list.filter((x) => x.id !== s.id)].slice(0, LOCAL_SESSIONS_MAX);
}

/** 이름도 서버의 세션 이름처럼 이름·연락처 꼴을 가린 뒤 둔다 (절대 규칙 4) */
export function withTitle(list: LocalSession[], id: string, title: string | null): LocalSession[] {
  const raw = title?.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, LOCAL_TITLE_MAX);
  const t = raw ? scanInput(raw).maskedText.slice(0, LOCAL_TITLE_MAX) : null;
  return list.map((x) => (x.id === id ? { ...x, title: t } : x));
}

let cache: { raw: string | null; list: LocalSession[] } = { raw: null, list: [] };

function read(): LocalSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
    if (raw !== cache.raw) cache = { raw, list: parseLocalSessions(raw) };
    return cache.list;
  } catch {
    return [];
  }
}

function write(list: LocalSession[]) {
  try {
    if (list.length === 0) localStorage.removeItem(LOCAL_SESSIONS_KEY);
    else localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // 저장소를 못 쓰면 목록만 빠진다
  }
}

export const addLocalSession = (id: string, maskedText: string) =>
  write(withSession(read(), { id, text: maskedText, at: new Date().toISOString(), title: null }));
export const renameLocalSession = (id: string, title: string | null) =>
  write(withTitle(read(), id, title));
export const removeLocalSession = (id: string) => write(read().filter((x) => x.id !== id));
export const clearLocalSessions = () => write([]);

function subscribe(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

const EMPTY: LocalSession[] = [];
export function useLocalSessions(): LocalSession[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
