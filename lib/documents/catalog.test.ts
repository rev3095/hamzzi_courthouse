import { describe, expect, it } from "vitest";
import { DOCUMENT_GROUPS } from "./catalog";
import { DOCUMENT_KINDS } from "./policy";

describe("문서 작성 목록 (DEC-067)", () => {
  it("모든 서식이 정확히 한 묶음에 들어 있다", () => {
    const listed = DOCUMENT_GROUPS.flatMap((g) => g.kinds);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...DOCUMENT_KINDS].sort());
  });
});
