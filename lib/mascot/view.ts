// 편집기 API 응답 모양 (라우트·화면 공용). 파일 이름 대신 바로 쓸 수 있는 주소를 준다.
import { MASCOT_MOODS, mascotFaceSrc, mascotSrc, type MascotMood } from "./moods";
import type { StudioState } from "./policy";

export const HISTORY_IMAGE_PATH = "/api/dev/studio/mascot/history";

export type MoodView = {
  mood: MascotMood;
  /** 이 상태 전용 그림이 있으면 true. false면 기본 그림을 쓴다 */
  custom: boolean;
  src: string;
  /** 머리 아이콘(얼굴). 상태 얼굴이 없으면 기본 얼굴 */
  faceSrc: string;
  /** 되돌리기 기록 (최근 것이 먼저). src null = 그때는 기본 그림 */
  history: { at: string; src: string | null }[];
};

export type StudioView = { moods: MoodView[] };

export function studioView(s: StudioState): StudioView {
  return {
    moods: MASCOT_MOODS.map((mood) => ({
      mood,
      custom: !!s.manifest.files[mood],
      src: mascotSrc(mood, s.manifest),
      faceSrc: mascotFaceSrc(mood, s.manifest),
      history: (s.history[mood] ?? []).map((e) => ({
        at: e.at,
        src: e.file ? `${HISTORY_IMAGE_PATH}/${e.file}` : null,
      })),
    })),
  };
}
