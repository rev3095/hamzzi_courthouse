// F-003 검색 종류 탭 시안 A (2026-11-18 사용자 승인): 모바일은 주요 4개 + 묶음별 '더 보기', 데스크톱은 전체.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { KindTabs, PRIMARY_KINDS, moreGroups, type SearchKind } from "@/components/search/KindTabs";
import { DECISION_TABS } from "@/lib/search/explore";

afterEach(cleanup);

const KINDS: { kind: SearchKind; label: string }[] = [
  { kind: "cases", label: "판례" },
  ...DECISION_TABS.map((d) => ({ kind: d.domain as SearchKind, label: d.label })),
  { kind: "ordinances", label: "자치법규" },
  { kind: "admin_rules", label: "행정규칙" },
];

function Harness({ onChange }: { onChange: (k: SearchKind) => void }) {
  const [v, setV] = useState<SearchKind>("cases");
  return (
    <KindTabs
      kinds={KINDS}
      value={v}
      label="검색 종류"
      onChange={(k) => {
        setV(k);
        onChange(k);
      }}
    />
  );
}

test("주요 4개를 뺀 모든 종류가 정확히 한 묶음에 들어간다 (새 종류는 법규·기타)", () => {
  const groups = moreGroups(KINDS);
  const inGroups = groups.flatMap((g) => g.items.map((i) => i.kind));
  expect(new Set(inGroups).size).toBe(inGroups.length);
  expect(inGroups.length + PRIMARY_KINDS.length).toBe(KINDS.length);
  expect(groups.map((g) => g.title)).toEqual(["재결례", "해석례", "위원회 결정문", "법규·기타"]);
  const extra = moreGroups([...KINDS, { kind: "future" as SearchKind, label: "새 자료" }]);
  expect(extra.at(-1)?.items.map((i) => i.label)).toContain("새 자료");
});

test("모바일: 주요 종류 밖 탭은 lg에서만 보이고, '더 보기'는 lg 미만에서만 보인다", () => {
  render(<Harness onChange={vi.fn()} />);
  const tabs = screen.getByRole("tablist", { name: "검색 종류" });
  expect(within(tabs).getByRole("tab", { name: "판례" }).className).not.toMatch(/hidden/);
  expect(within(tabs).getByRole("tab", { name: "국세청 해석" }).className).toMatch(
    /hidden lg:flex/,
  );
  expect(screen.getByRole("button", { name: /더 보기 16/ }).className).toMatch(/lg:hidden/);
});

test("'더 보기'를 펴서 숨긴 종류를 고르면 패널이 닫히고 그 이름이 '더 보기' 자리에 보인다", () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  const more = screen.getByRole("button", { name: /더 보기 16/ });
  expect(more.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(more);
  expect(more.getAttribute("aria-expanded")).toBe("true");
  const panel = screen.getByRole("region", { name: "해석례" });
  fireEvent.click(within(panel).getByRole("button", { name: "국세청 해석" }));
  expect(onChange).toHaveBeenCalledWith("nts");
  expect(screen.queryByRole("region", { name: "해석례" })).toBeNull();
  expect(screen.getByRole("button", { name: /^국세청 해석/, expanded: false })).toBeDefined();
  expect(screen.getByRole("tab", { name: "국세청 해석" }).getAttribute("aria-selected")).toBe(
    "true",
  );
});
