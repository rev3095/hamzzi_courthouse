import { describe, expect, test } from "vitest";
import { RANK_NOTE, baseLawName, isCoreLaw, rankDomestic, rankWorld, tierOf } from "./rank";

const law = (name: string, kind: string | null = null) => ({ name, kind });

describe("DEC-076 법령 목록 순서 (고정 규칙)", () => {
  test("법령 위계: 헌법 → 법률 → 대통령령 → 총리령·부령 → 그 밖", () => {
    expect(tierOf("헌법", "대한민국헌법")).toBe(0);
    expect(tierOf("법률")).toBe(1);
    expect(tierOf("대통령령")).toBe(2);
    expect(tierOf("총리령")).toBe(3);
    expect(tierOf("보건복지부령")).toBe(3);
    expect(tierOf("고시")).toBe(4);
    expect(tierOf(null, "의료기기법 시행규칙")).toBe(3);
  });

  test("시행령·시행규칙은 그 법률로 묶는다", () => {
    expect(baseLawName("의료기기법 시행령")).toBe("의료기기법");
    expect(baseLawName("의료기기법 시행규칙")).toBe("의료기기법");
    expect(isCoreLaw("주택임대차보호법 시행령")).toBe(true);
    expect(isCoreLaw("의료기기 허가·신고·심사 등에 관한 규정")).toBe(false);
  });

  test("자주 쓰는 법령 묶음 먼저, 묶음 안은 위계 순, 나머지는 출처 순서 그대로", () => {
    const items = [
      law("의료기기 표준코드 관리 규정", "고시"),
      law("의료기기법 시행규칙", "총리령"),
      law("첨단재생의료 및 첨단바이오의약품 안전 및 지원에 관한 법률", "법률"),
      law("의료기기법 시행령", "대통령령"),
      law("의료기기법", "법률"),
    ];
    expect(rankDomestic(items, (x) => x).map((x) => x.name)).toEqual([
      "의료기기법",
      "의료기기법 시행령",
      "의료기기법 시행규칙",
      "의료기기 표준코드 관리 규정",
      "첨단재생의료 및 첨단바이오의약품 안전 및 지원에 관한 법률",
    ]);
  });

  test("국내 먼저, 해외는 핵심 법령 → 나라 순서", () => {
    const items = [
      { name: "UK Act", country: "uk" },
      { name: "21 CFR 820", country: "us" },
      { name: "의료기기법", kind: "법률", country: "kr" },
      { name: "MDR", country: "eu", curated: true },
    ];
    expect(rankWorld(items, (x) => x, ["kr", "us", "eu", "uk"]).map((x) => x.name)).toEqual([
      "의료기기법",
      "MDR",
      "21 CFR 820",
      "UK Act",
    ]);
  });

  test("정렬 기준을 화면에 밝히고 AI가 정하지 않음을 적는다", () => {
    expect(RANK_NOTE).toMatch(/고정 목록/);
    expect(RANK_NOTE).toMatch(/AI가 정하지 않아요/);
    expect(RANK_NOTE).not.toMatch(/관련도|유리|불리/);
  });
});
