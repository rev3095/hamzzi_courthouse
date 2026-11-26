// 주 메뉴 5개 (DEC-067, UI·UX 개정 PR 1): 데스크톱 헤더 글자 메뉴와 휴대폰 아래 탭바가 같은 목록을 쓴다.
// 앱(mobile/)의 탭 다섯(법정·판례 법령·절차 서식·광장·내 정보)과 같은 구성이다. 내 정보는 헤더 프로필 아이콘이 맡는다.
// 순수 규칙만 둔다 — 화면 컴포넌트는 components/nav/*.

export type NavKey = "consult" | "archive" | "documents" | "matters" | "community";

export type NavSection = {
  key: NavKey;
  href: string;
  label: string;
  /** 이 메뉴에 속하는 주소 앞부분 (현재 위치 표시용) */
  prefixes: readonly string[];
};

export const MAIN_NAV: readonly NavSection[] = [
  {
    key: "consult",
    href: "/",
    label: "상담",
    prefixes: ["/inquiries", "/examples", "/assistants", "/casefile"],
  },
  {
    key: "archive",
    href: "/search",
    label: "판례·법령",
    prefixes: [
      "/search",
      "/research",
      "/cases",
      "/laws",
      "/statutes",
      "/decisions",
      "/ordinances",
    ],
  },
  { key: "documents", href: "/documents", label: "문서 작성", prefixes: ["/documents"] },
  { key: "matters", href: "/matters", label: "사건 진행", prefixes: ["/matters"] },
  { key: "community", href: "/community", label: "광장", prefixes: ["/community"] },
];

/** 주소가 어느 주 메뉴에 속하는지. 홈("/")은 상담이고, 어느 메뉴에도 속하지 않으면 null */
export function activeSection(pathname: string | null | undefined): NavKey | null {
  if (!pathname) return null;
  if (pathname === "/") return "consult";
  for (const s of MAIN_NAV) {
    if (s.prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return s.key;
  }
  return null;
}
