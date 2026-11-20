// 앱 화면 이동 (DEC-049). 화면 상태는 메모리에만 둔다 — 질문을 주소(URL)나 기기 저장소에 남기지 않는다.
import type { DocumentKind } from "@/lib/procedure/steps";
import type { CategoryKey } from "@/lib/procedure/categories";
import type { CaseRef, Tier } from "./api";

export type Screen =
  | { name: "home" }
  | {
      name: "read";
      question: string;
      category: CategoryKey | null;
      mode: "ai" | "rule";
      tier: Tier;
      deep: boolean;
    }
  | { name: "example"; id: string; back: Screen }
  | { name: "explore" }
  | { name: "case"; ref: CaseRef; back: Screen }
  | { name: "guide" }
  | { name: "track"; category: CategoryKey }
  | { name: "doc"; kind: DocumentKind }
  | { name: "community" }
  | { name: "post"; id: string }
  | { name: "me" }
  | { name: "bot" };

/** 서버 연결 상태. preview = 서버에 닿지 않아 기기 안 자료로 동작 */
export type Net = "checking" | "live" | "preview";

export type Ctx = {
  net: Net;
  /** 기기의 인터넷 연결 (바깥 링크를 열 수 있는지) */
  online: boolean;
  go: (s: Screen) => void;
};

export type TabKey = "home" | "explore" | "guide" | "community" | "me";

export function tabOf(s: Screen): TabKey {
  switch (s.name) {
    case "explore":
    case "case":
      return "explore";
    case "guide":
    case "track":
    case "doc":
      return "guide";
    case "community":
    case "post":
      return "community";
    case "me":
    case "bot":
      return "me";
    case "example":
      return tabOf(s.back);
    default:
      return "home";
  }
}
