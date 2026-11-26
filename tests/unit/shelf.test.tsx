// DEC-072 ⓒ 보관함 정리: 폴더·메모는 이 기기(localStorage)에만, 내보내기는 담을 때 만든 인용 표기 그대로.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { addPin, updatePin, type RecentItem } from "@/components/search/recent";
import { exportShelf, folderNames, groupByFolder, NO_FOLDER } from "@/components/search/shelf";
import { ShelfPage } from "@/components/search/ShelfPage";

const item = (href: string, title: string, folder?: string, memo?: string): RecentItem => ({
  href,
  title,
  sub: `대법원 인용 ${title}`,
  kind: "판례",
  at: 1,
  ...(folder && { folder }),
  ...(memo && { memo }),
});

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("폴더 묶기·내보내기 (순수)", () => {
  const pins = [
    item("/cases/1", "가", "임대차", "보증금 반환 시기"),
    item("/cases/2", "나"),
    item("/cases/3", "다", "가압류"),
  ];

  test("폴더는 가나다순, 폴더 없는 자료는 맨 뒤", () => {
    expect(groupByFolder(pins).map((g) => [g.folder, g.items.length])).toEqual([
      ["가압류", 1],
      ["임대차", 1],
      [NO_FOLDER, 1],
    ]);
    expect(folderNames(pins)).toEqual(["가압류", "임대차"]);
  });

  test("인용 표기만 / 글 / 마크다운 — 담을 때 만든 인용 표기를 그대로 쓴다", () => {
    expect(exportShelf(pins, "citations")).toBe("대법원 인용 가\n대법원 인용 나\n대법원 인용 다");
    const md = exportShelf(pins, "markdown", "https://example.test");
    expect(md).toContain("## 임대차");
    expect(md).toContain("- [가](https://example.test/cases/1) — 대법원 인용 가");
    expect(md).toContain("  - 메모: 보증금 반환 시기");
    const txt = exportShelf(pins, "text", "https://example.test");
    expect(txt).toContain("[가압류]\n· 다\n  대법원 인용 다\n  https://example.test/cases/3");
  });
});

describe("보관함 저장소", () => {
  test("폴더·메모는 자리를 바꾸지 않고 고치고, 빈 값이면 지우며, 길이를 자른다", () => {
    addPin({ href: "/cases/1", title: "가", sub: "a", kind: "판례" });
    addPin({ href: "/cases/2", title: "나", sub: "b", kind: "판례" });
    updatePin("/cases/1", { folder: "임대차", memo: "x".repeat(400) });
    let saved = JSON.parse(localStorage.getItem("hz:pins")!) as RecentItem[];
    expect(saved.map((p) => p.href)).toEqual(["/cases/2", "/cases/1"]);
    expect(saved[1].folder).toBe("임대차");
    expect(saved[1].memo).toHaveLength(300);
    updatePin("/cases/1", { folder: "", memo: null });
    saved = JSON.parse(localStorage.getItem("hz:pins")!) as RecentItem[];
    expect(saved[1]).not.toHaveProperty("folder");
    expect(saved[1]).not.toHaveProperty("memo");
  });
});

describe("보관함 정리 화면", () => {
  test("새 폴더를 만들어 옮기고, 폴더로 거르고, 메모를 남긴다 — 서버 호출 없음", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    addPin({ href: "/cases/1", title: "임대차보증금반환", sub: "대법원 인용", kind: "판례" });
    addPin({ href: "/cases/2", title: "가압류", sub: "대법원 인용2", kind: "판례" });
    render(<ShelfPage />);
    fireEvent.change(screen.getByLabelText("임대차보증금반환 폴더"), {
      target: { value: "__new__" },
    });
    fireEvent.change(screen.getByLabelText("새 폴더 이름"), { target: { value: "보증금 사건" } });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "만들기" }));
    });
    const folders = screen.getByRole("list", { name: "폴더" });
    fireEvent.click(within(folders).getByRole("button", { name: /보증금 사건/ }));
    expect(screen.queryByText("가압류")).toBeNull();
    const memo = screen.getByPlaceholderText(/왜 담았는지/);
    fireEvent.change(memo, { target: { value: "반환 시기 쟁점" } });
    fireEvent.blur(memo);
    const saved = JSON.parse(localStorage.getItem("hz:pins")!) as RecentItem[];
    expect(saved.find((p) => p.href === "/cases/1")).toMatchObject({
      folder: "보증금 사건",
      memo: "반환 시기 쟁점",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
