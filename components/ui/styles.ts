// 공통 화면 부품의 클래스 (DEC-067 UI·UX 개정 PR 2): 화면마다 따로 정하던 제목·버튼·카드·탭 크기를 한 곳에 둔다.
// 값은 브랜드 가이드 3.2·3.3(docs/05)의 토큰만 쓴다 — 모서리 패널 16·카드 12·버튼 8, 터치 영역 44px, 주요 버튼은 ink 하나.

/** 주 메뉴 화면의 맨 위 제목 (h1). 홈 히어로·결과 제목·상세 화면 제목은 따로 둔다 */
export const PAGE_TITLE =
  "font-display text-ink text-[30px] leading-tight font-bold lg:text-[38px]";

/** 제목 아래 한두 줄 소개 */
export const PAGE_LEAD = "text-muted mt-2 max-w-[720px] text-[15px] leading-relaxed";

/** 주요 버튼 (ink 바탕·흰 글자) */
export const BTN_PRIMARY =
  "bg-ink rounded-button inline-flex min-h-11 shrink-0 items-center justify-center px-4 text-[14px] font-bold whitespace-nowrap text-white disabled:opacity-40";

/** 보조 버튼 (흰 바탕·line 테두리) */
export const BTN_SECONDARY =
  "border-line text-ink hover:border-ink rounded-button inline-flex min-h-11 shrink-0 items-center justify-center border bg-white px-4 text-[14px] font-semibold whitespace-nowrap disabled:opacity-40";

/** 알약 탭 하나. on = 고른 탭 (ink 바탕) */
export const pillTab = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[14px] font-bold whitespace-nowrap ${
    on ? "border-ink bg-ink text-white" : "border-line text-ink hover:border-ink bg-white"
  }`;

/** 알약 탭 줄: 좁은 화면에서는 줄바꿈 대신 가로로 밀어 본다 */
export const PILL_TAB_ROW = "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]";
