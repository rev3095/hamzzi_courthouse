// 미리 만들어 둔 법령 쉬운 설명 (DEC-074). 저장소의 JSON(lib/search/easy/data.json)이 원본이다.
// 만들기: tests/live/law-easy.live.test.ts(유료, 사용자 허락 뒤). 서버에서만 import한다 — 브라우저는 GET /api/v1/laws/{name}/easy로 받는다.
// 저장된 문장도 보여 주기 전에 지금 규칙(screenEasy)과 지금 조문으로 다시 거른다 — 법이 바뀌어 없어진 조문 번호·숫자는 빠진다.
import raw from "./data.json";
import { easyUsable, screenEasy, type EasyArticle, type EasyLaw, type EasyRaw } from "./policy";

export type EasyStored = {
  /** 만든 때의 지시문 버전 (lib/ai/law-easy.ts LAW_EASY_PROMPT_VERSION) */
  promptVersion: string;
  generatedAt: string;
  easy: EasyRaw;
};
export type EasyData = { version: number; laws: Record<string, EasyStored> };

const keyOf = (lawName: string) => lawName.normalize("NFKC").replace(/\s+/g, "");
const DATA = new Map(
  Object.entries((raw as EasyData).laws ?? {}).map(([name, v]) => [keyOf(name), v]),
);

/**
 * 저장된 쉬운 설명이 있으면 지금 조문으로 다시 걸러 돌려준다. 없거나 거른 뒤 남는 것이 모자라면 null.
 * allowVirtual이 false면 가상 사례를 뺀다 (실제 판례가 충분할 때).
 */
export function findEasyLaw(
  lawName: string,
  articles: EasyArticle[],
  opts: { allowVirtual?: boolean; data?: Map<string, EasyStored> } = {},
): EasyLaw | null {
  const stored = (opts.data ?? DATA).get(keyOf(lawName));
  if (!stored) return null;
  const { easy } = screenEasy(stored.easy, articles, {
    allowVirtual: opts.allowVirtual,
    lawName,
  });
  return easyUsable(easy) ? { lawName, ...easy } : null;
}

/** 저장된 법령 이름 수 (점검용) */
export const easyDataSize = () => DATA.size;
