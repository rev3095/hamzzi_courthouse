"use client";
// 조회 이력·보관함 (DEC-029 제안, DEC-054 검색·리서치 공용). 열어 본·담아 둔 판례·조문·결정문·자치법규의 제목·주소·종류와 인용 표기(공개 자료)만 이 기기(localStorage)에 둔다.
// 검색어·질문은 담지 않는다 — 공개 자료의 이름뿐이다 (F-007). 서버로 보내지 않고, '내 기록 삭제'와 '지우기'로 없앤다.
import { useEffect, useSyncExternalStore } from "react";

export type RecentItem = {
  href: string;
  title: string;
  sub: string;
  kind: string;
  at: number;
  /** 보관함만 (DEC-072 ⓒ): 사용자가 붙인 폴더 이름·메모. 이 기기에만 두고 서버로 보내지 않는다 */
  folder?: string;
  memo?: string;
};

export const FOLDER_MAX = 20;
export const MEMO_MAX = 300;
const clip = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const EMPTY: RecentItem[] = [];

/** localStorage 한 키에 두는 작은 목록. 같은 href는 하나만, 새 항목이 앞 */
function createListStore(key: string, max: number) {
  let cache: { raw: string | null; items: RecentItem[] } = { raw: null, items: [] };

  function read(): RecentItem[] {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return EMPTY;
    }
    if (raw === cache.raw) return cache.items;
    let items: RecentItem[] = [];
    try {
      const v: unknown = JSON.parse(raw ?? "[]");
      if (Array.isArray(v)) {
        items = v
          .filter(
            (x): x is RecentItem =>
              !!x &&
              typeof x.href === "string" &&
              x.href.startsWith("/") &&
              typeof x.title === "string" &&
              typeof x.sub === "string" &&
              typeof x.kind === "string",
          )
          .map((x) => {
            // 폴더·메모는 글자일 때만, 길이를 잘라 둔다 (손으로 고친 저장소 값도 화면을 깨지 않게)
            const folder = clip(x.folder, FOLDER_MAX);
            const memo = clip(x.memo, MEMO_MAX);
            const { folder: _f, memo: _m, ...rest } = x;
            void _f;
            void _m;
            return { ...rest, ...(folder && { folder }), ...(memo && { memo }) };
          });
      }
    } catch {
      items = [];
    }
    cache = { raw, items };
    return items;
  }

  function subscribe(cb: () => void) {
    window.addEventListener(key, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(key, cb);
      window.removeEventListener("storage", cb);
    };
  }

  function write(items: RecentItem[]) {
    try {
      if (items.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(items.slice(0, max)));
      window.dispatchEvent(new Event(key));
    } catch {
      // 저장소를 못 쓰면 목록만 빠진다
    }
  }

  return {
    add(item: Omit<RecentItem, "at">) {
      write([
        { ...item, title: item.title.slice(0, 120), sub: item.sub.slice(0, 120), at: Date.now() },
        ...read().filter((r) => r.href !== item.href),
      ]);
    },
    remove: (href: string) => write(read().filter((r) => r.href !== href)),
    /** 자리를 바꾸지 않고 폴더·메모만 고친다. 빈 값이면 그 항목을 지운다 */
    update(href: string, patch: { folder?: string | null; memo?: string | null }) {
      write(
        read().map((r) => {
          if (r.href !== href) return r;
          const next: RecentItem = { ...r };
          if (patch.folder !== undefined) {
            const f = clip(patch.folder, FOLDER_MAX);
            if (f) next.folder = f;
            else delete next.folder;
          }
          if (patch.memo !== undefined) {
            const m = clip(patch.memo, MEMO_MAX);
            if (m) next.memo = m;
            else delete next.memo;
          }
          return next;
        }),
      );
    },
    clear: () => write([]),
    use: () => useSyncExternalStore(subscribe, read, () => EMPTY),
  };
}

const recent = createListStore("hz:recent", 20);
/** 보관함: 리서치 화면에서 담아 둔 자료 */
const pins = createListStore("hz:pins", 50);

export const addRecent = recent.add;
export const clearRecent = recent.clear;
export const useRecent = recent.use;

export const addPin = pins.add;
export const removePin = pins.remove;
export const clearPins = pins.clear;
export const updatePin = pins.update;
export const usePins = pins.use;

/** 상세 화면이 열렸을 때 한 번 기록한다 */
export function useRecordRecent(item: Omit<RecentItem, "at"> | null) {
  const key = item ? `${item.href}|${item.title}` : null;
  useEffect(() => {
    if (item) addRecent(item);
    // 같은 자료는 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
