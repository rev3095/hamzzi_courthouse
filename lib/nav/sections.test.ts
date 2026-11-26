import { describe, expect, it } from "vitest";
import { activeSection, MAIN_NAV } from "./sections";

describe("주 메뉴 (DEC-067)", () => {
  it("메뉴는 5개이고 주소가 겹치지 않는다", () => {
    expect(MAIN_NAV.map((s) => s.label)).toEqual([
      "상담",
      "판례·법령",
      "문서 작성",
      "사건",
      "광장",
    ]);
    const all = MAIN_NAV.flatMap((s) => s.prefixes);
    expect(new Set(all).size).toBe(all.length);
  });

  it("주소마다 현재 메뉴를 고른다", () => {
    expect(activeSection("/")).toBe("consult");
    expect(activeSection("/inquiries/abc")).toBe("consult");
    expect(activeSection("/casefile")).toBe("matters");
    expect(activeSection("/casefile/examples/x")).toBe("matters");
    expect(activeSection("/research")).toBe("archive");
    expect(activeSection("/cases/123")).toBe("archive");
    expect(activeSection("/decisions/prec/1")).toBe("archive");
    expect(activeSection("/documents")).toBe("documents");
    expect(activeSection("/documents/complaint")).toBe("documents");
    expect(activeSection("/matters")).toBe("matters");
    expect(activeSection("/community/12")).toBe("community");
  });

  it("어느 메뉴에도 속하지 않으면 표시하지 않는다", () => {
    expect(activeSection("/me")).toBeNull();
    expect(activeSection("/about/features")).toBeNull();
    expect(activeSection("/searchable")).toBeNull();
    expect(activeSection(null)).toBeNull();
  });
});
