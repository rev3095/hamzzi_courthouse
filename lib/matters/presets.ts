// 가상 사건 프리셋 (DEC-061) — 로그인하지 않은 사람이 '사건 분석' 화면에서 기능을 둘러볼 수 있게 미리 채운 가상 사건.
// 사람 이름 없이 역할·기호로만 쓴 지어낸 사건이고, 쟁점 근거는 법제처 인용 검증을 통과한 문단만 붙였다
// (tests/live/matter-presets.live.test.ts → scripts/build-matter-presets.mjs). 브라우저에서 읽기만 하고 저장하지 않는다.
import type { MatterData } from "./model";
import data from "./presets.json";

export type MatterPreset = { id: string; title: string; data: MatterData };

export const MATTER_PRESETS = data as unknown as MatterPreset[];

/** 프리셋 화면 머리 안내 */
export const PRESET_NOTICE =
  "로그인 없이 둘러보는 가상 사건이에요. 사람 이름 없이 지어낸 사건이고, AI가 채운 내용이 들어 있어요. 고친 내용은 이 화면을 떠나면 사라지고, 서류 읽기·쟁점 정리·기업 조사 같은 AI 기능은 로그인한 뒤 쓸 수 있어요.";

export const presetById = (id: string) => MATTER_PRESETS.find((p) => p.id === id) ?? null;
