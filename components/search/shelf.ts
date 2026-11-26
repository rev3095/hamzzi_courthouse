// 보관함 정리 순수 규칙 (DEC-075 ⓒ): 폴더 묶기 · 내보내기 글 만들기. 공개 자료의 제목·인용 표기·주소와 사용자가 적은
// 폴더·메모만 다룬다 — 이 기기 안에서만 쓰고 서버로 보내지 않는다. 관련도·유불리 판단 없음.
import type { RecentItem } from "./recent";

export const NO_FOLDER = "폴더 없음";

/** 폴더별 묶음. 폴더 이름은 가나다순, 폴더 없는 자료는 맨 뒤. 묶음 안 순서는 담은 순서(최근 먼저) 그대로 */
export function groupByFolder(pins: RecentItem[]): { folder: string; items: RecentItem[] }[] {
  const map = new Map<string, RecentItem[]>();
  for (const p of pins) {
    const key = p.folder ?? NO_FOLDER;
    map.set(key, [...(map.get(key) ?? []), p]);
  }
  const names = [...map.keys()]
    .filter((k) => k !== NO_FOLDER)
    .sort((a, b) => a.localeCompare(b, "ko"));
  return [...names, ...(map.has(NO_FOLDER) ? [NO_FOLDER] : [])].map((folder) => ({
    folder,
    items: map.get(folder)!,
  }));
}

export const folderNames = (pins: RecentItem[]) =>
  [...new Set(pins.flatMap((p) => (p.folder ? [p.folder] : [])))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );

export type ExportFormat = "citations" | "text" | "markdown";
export const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "citations", label: "인용 표기만" },
  { format: "text", label: "글(제목·인용·주소·메모)" },
  { format: "markdown", label: "마크다운" },
];

/**
 * 내보내기 글. origin을 주면 이 사이트 주소를 붙인다(상세 화면 주소 — 공개 자료).
 * 인용 표기는 담을 때 법제처 값으로 만든 그대로 쓰고, 새로 만들지 않는다
 */
export function exportShelf(pins: RecentItem[], format: ExportFormat, origin = ""): string {
  if (format === "citations") return pins.map((p) => p.sub).join("\n");
  const groups = groupByFolder(pins);
  const url = (p: RecentItem) => (p.href.startsWith("/") ? `${origin}${p.href}` : p.href);
  if (format === "markdown")
    return groups
      .map(
        (g) =>
          `## ${g.folder}\n\n` +
          g.items
            .map(
              (p) =>
                `- [${p.title.replace(/[[\]]/g, "")}](${url(p)}) — ${p.sub}` +
                (p.memo ? `\n  - 메모: ${p.memo.replace(/\n+/g, " ")}` : ""),
            )
            .join("\n"),
      )
      .join("\n\n");
  return groups
    .map(
      (g) =>
        `[${g.folder}]\n` +
        g.items
          .map(
            (p) =>
              `· ${p.title}\n  ${p.sub}\n  ${url(p)}` +
              (p.memo ? `\n  메모: ${p.memo.replace(/\n+/g, " ")}` : ""),
          )
          .join("\n"),
    )
    .join("\n\n");
}
