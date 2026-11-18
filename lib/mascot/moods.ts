// 햄찌 판사 상태별 그림 (브랜드 가이드 2.3 표정 세트). 화면은 상황에 맞는 상태를 넘기고,
// 그 상태 그림이 없으면 기본 그림(public/mascot/hamzzi-judge.webp)을 쓴다.
// 상태 그림은 /studio 편집기(개발 전용)로 올리고, manifest.json에 파일 이름이 기록된다.
import manifest from "./manifest.json";

export const MASCOT_MOODS = [
  "default",
  "thinking",
  "done",
  "ask",
  "curious",
  "sorry",
  "error",
  "calm",
] as const;

export type MascotMood = (typeof MASCOT_MOODS)[number];

/** 전신 그림 크기. 상태 그림도 같은 캔버스(투명 배경, 발 기준 아래 정렬)로 맞춘다 */
export const MASCOT_SIZE = { width: 480, height: 635 } as const;

export const DEFAULT_MASCOT_SRC = "/mascot/hamzzi-judge.webp";
/** 얼굴(머리 아이콘) 기본 그림. 상태별 얼굴은 manifest.faces */
export const DEFAULT_FACE_SRC = "/mascot/hamzzi-face.webp";
export const MOOD_DIR = "/mascot/moods";

export type MoodInfo = {
  label: string;
  /** 언제 쓰는지 한 줄 */
  when: string;
  /** 지금 이 상태를 쓰는 화면 (없으면 빈 배열) */
  usedIn: string[];
  /** 브랜드 가이드 2.5 대사 예시. 민감·오류 상황은 농담 없이 */
  line?: string;
  /** 그림 방향 메모 (브랜드 가이드 2.3·2.4) */
  art: string;
};

export const MOOD_INFO: Record<MascotMood, MoodInfo> = {
  default: {
    label: "기본",
    when: "처음 화면, 특별한 상황이 아닐 때",
    usedIn: ["홈 히어로"],
    line: "무슨 일이 있었나요? 편하게 말해 주세요!",
    art: "미소, 방망이를 든 기본 자세",
  },
  thinking: {
    label: "분석 중",
    when: "법령·판례를 찾고 답변을 쓰는 동안",
    usedIn: ["결과 화면 · 분석 진행"],
    line: "판례 서고를 뒤지는 중이에요…",
    art: "집중한 표정, 방망이를 들고 두드리는 자세",
  },
  done: {
    label: "기쁨",
    when: "정리가 끝났을 때, 저장이 끝났을 때",
    usedIn: ["결과 화면 · 정리 머리 아이콘(얼굴)"],
    line: "정리 끝! 아래에서 확인해 보세요.",
    // 정리가 끝났다는 안내일 뿐 — 결과가 유리하다는 뜻으로 보이면 안 된다 (절대 규칙 2, 승패 판단 없음)
    art: "가볍게 웃는 표정. 정리 끝 안내용 — 결과가 유리하다는 뜻으로 보이지 않게",
  },
  ask: {
    label: "재질문 필요",
    when: "추가 정보나 확인이 필요해 다시 물어야 할 때",
    usedIn: ["결과 화면 · 가린 문장 확인 필요"],
    line: "조금만 더 알려주시면 더 비슷한 판례를 찾을 수 있어요.",
    art: "고민하는 표정, 고개를 갸웃",
  },
  curious: {
    label: "궁금함",
    when: "이어 묻기·예시 질문처럼 질문을 기다릴 때",
    usedIn: ["햄찌 안내 챗봇 · 첫 인사"],
    line: "더 궁금한 점이 있나요?",
    art: "호기심 어린 눈, 귀를 쫑긋",
  },
  sorry: {
    label: "답변이 어려움",
    when: "결과 없음, 질문 횟수·하루 상한에 닿았을 때",
    usedIn: ["결과 화면 · 결과 없음", "결과 화면 · 횟수·상한 안내", "질문 3번 안내 창"],
    line: "비슷한 판례를 아직 못 찾았어요. 다르게 표현해 볼까요?",
    art: "미안한 표정, 방망이를 내림",
  },
  error: {
    label: "오류",
    when: "검색·답변 생성 실패, 시간 초과, 일시적 오류",
    usedIn: ["결과 화면 · 오류"],
    line: "앗, 서고 문이 잠깐 잠겼어요. 잠시 후 다시 시도해 주세요.",
    art: "당황한 표정. 농담·의성어 없이 차분하게",
  },
  calm: {
    label: "차분",
    when: "형사·가정폭력 등 민감한 사건 유형",
    usedIn: [],
    art: "방망이를 내려놓은 차분한 표정, 대사 없음",
  },
};

export type MascotManifest = {
  files: Partial<Record<MascotMood, string>>;
  /** 머리 아이콘(얼굴, 160×160)이 따로 있는 상태. 없으면 기본 얼굴 */
  faces?: Partial<Record<MascotMood, string>>;
};

export function isMood(v: unknown): v is MascotMood {
  return typeof v === "string" && (MASCOT_MOODS as readonly string[]).includes(v);
}

/** 상태 그림 주소. 그 상태 그림이 없으면 기본 상태 그림, 그것도 없으면 원래 기본 그림 */
export function mascotSrc(mood: MascotMood, m: MascotManifest = manifest): string {
  const file = m.files[mood] ?? m.files.default;
  return file ? `${MOOD_DIR}/${file}` : DEFAULT_MASCOT_SRC;
}

/** 상태 얼굴(머리 아이콘) 주소. 그 상태 얼굴이 없으면 기본 얼굴 */
export function mascotFaceSrc(mood: MascotMood, m: MascotManifest = manifest): string {
  const file = m.faces?.[mood];
  return file ? `${MOOD_DIR}/${file}` : DEFAULT_FACE_SRC;
}

/** 결과 화면 오류 코드 → 마스코트 상태. 연결·서버 문제는 error, 한도·범위 문제는 sorry, 확인 요청은 ask */
export function moodForError(code: string): MascotMood {
  if (code === "PII_CONFIRMATION_REQUIRED") return "ask";
  if (code === "RATE_LIMITED" || code === "LOGIN_REQUIRED") return "sorry";
  return "error";
}
