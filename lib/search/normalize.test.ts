// @vitest-environment node
// 법제처 응답 변환 순수 함수 (F-003, F-004, F-005, F-007). fixture는 실제 korean-law-mcp 응답을 줄인 것이다.
import { describe, expect, test } from "vitest";
import lawText from "@/tests/fixtures/korean-law-mcp/law-text-article.json";
import record from "@/tests/fixtures/korean-law-mcp/precedent-record.json";
import verifyCases from "@/tests/fixtures/korean-law-mcp/verify-cases.json";
import verifyMissing from "@/tests/fixtures/korean-law-mcp/verify-missing.json";
import verifyNone from "@/tests/fixtures/korean-law-mcp/verify-none.json";
import verifyOk from "@/tests/fixtures/korean-law-mcp/verify-ok.json";
import { EvidenceSet } from "./evidence";
import {
  articleBody,
  articleLabel,
  bodyExcerpt,
  caseUrl,
  findArticleUnit,
  isoDate,
  normalizeArticleNo,
  parseCaseVerify,
  parseStatuteVerify,
  statuteKey,
  stripHtml,
} from "./normalize";

describe("변환 기본", () => {
  test("isoDate", () => {
    expect(isoDate("20260409")).toBe("2026-04-09");
    expect(isoDate("2026.04.09")).toBe("2026-04-09");
    expect(isoDate("20260102120100")).toBe("2026-01-02");
    expect(isoDate("20261340")).toBeNull();
    expect(isoDate("")).toBeNull();
  });

  test("F-004 조문번호 표기", () => {
    expect(articleLabel("0003", "00")).toBe("제3조");
    expect(articleLabel("0003", "02")).toBe("제3조의2");
    expect(articleLabel("", "")).toBeNull();
    expect(normalizeArticleNo("제3조의2 제1항")).toBe("제3조의2");
    expect(normalizeArticleNo("제 750 조")).toBe("제750조");
    expect(normalizeArticleNo("부칙")).toBeNull();
  });

  test("stripHtml은 줄바꿈을 살리고 태그를 지운다", () => {
    expect(stripHtml("<br/> [1] 가 &amp; 나<br/><br/>  다 ")).toBe("[1] 가 & 나\n다");
    expect(stripHtml(undefined)).toBeNull();
  });

  test("F-003 AC3 원문 링크는 공개 주소이고 인증키가 없다", () => {
    expect(caseUrl("619451")).toBe("https://www.law.go.kr/LSW/precInfoP.do?precSeq=619451");
    expect(caseUrl("619451")).not.toMatch(/OC=/);
  });
});

describe("F-004 조문 본문", () => {
  test("조문 단위를 찾아 항·호를 본문에 합친다", () => {
    const unit = findArticleUnit(lawText, "제3조의2");
    expect(unit).not.toBeNull();
    const body = articleBody(unit!);
    expect(body).toContain("① 임차인");
    expect(body).toContain("1. 「은행법」에 따른 은행");
    expect(body).not.toContain("<");
  });

  test("없는 조문은 null", () => {
    expect(findArticleUnit(lawText, "제999조")).toBeNull();
    expect(findArticleUnit({}, "제1조")).toBeNull();
  });
});

describe("F-007 판례 본문 일부", () => {
  test("당사자·대리인 머리 블록을 떼고 이유부터 쓰며 개인정보를 가린다", () => {
    const excerpt = bodyExcerpt(record["판례내용"])!;
    expect(excerpt).toContain("상가건물 임대차보호법 제9조 제2항");
    expect(excerpt).not.toContain("홍길동"); // 소송대리인
    expect(excerpt).not.toContain("010-1234-5678");
    expect(excerpt).not.toContain("원심판결");
  });

  test("본문이 없으면 null", () => {
    expect(bodyExcerpt("")).toBeNull();
    expect(bodyExcerpt(undefined)).toBeNull();
  });
});

describe("F-005 AC2 ③ 재조회 결과 해석", () => {
  test("실존 조문", () => {
    expect(parseStatuteVerify("주택임대차보호법 제3조의2", verifyOk.text)).toEqual({
      citation: "주택임대차보호법 제3조의2",
      exists: true,
    });
  });

  test("없는 조문은 exists=false와 사유", () => {
    const r = parseStatuteVerify("민법 제9999조", verifyMissing.text);
    expect(r.exists).toBe(false);
    expect(r.note).toContain("해당 조문 없음");
  });

  test("인용 형식이 아니면 판정 불가(확인 필요)", () => {
    expect(parseStatuteVerify("보증금", verifyNone.text).exists).toBeNull();
    expect(parseStatuteVerify("x", "알 수 없는 응답").exists).toBeNull();
  });

  test("사건번호 실존·부존재", () => {
    expect(parseCaseVerify("2023다307116", verifyCases.lines).exists).toBe(true);
    const fake = parseCaseVerify("2099다99999", verifyCases.lines);
    expect(fake.exists).toBe(false);
    expect(fake.note).toContain("NOT_FOUND");
    expect(parseCaseVerify("2000다1", verifyCases.lines).exists).toBeNull();
  });
});

describe("F-005 AC2 ① 근거 모음", () => {
  const article = {
    id: statuteKey("주택임대차보호법", "제3조의2"),
    lawName: "주택임대차보호법",
    articleNo: "제3조의2",
    title: "보증금의 회수",
    text: "① 임차인이 …",
    effectiveFrom: "2026-01-02",
    sourceUrl: "https://www.law.go.kr/",
  };
  const hit = {
    id: "619451",
    caseNo: "2023다307116",
    caseName: "건물인도",
    court: "대법원",
    decidedAt: "2026-04-09",
    sourceUrl: caseUrl("619451"),
  };
  const detail = {
    ...hit,
    holding: "[1] 판시",
    summary: "[1] 요지",
    refs: null,
    fromBody: false,
    bodyExcerpt: null,
  };

  test("가져온 조문·판례만 근거로 인정한다", () => {
    const ev = new EvidenceSet();
    ev.addArticle(article);
    ev.addCase(hit);
    expect(ev.findStatute("주택 임대차보호법", "제3조의2")).toBeDefined();
    expect(ev.findStatute("주택임대차보호법", "제3조")).toBeUndefined();
    expect(ev.findCase("2023다307116")).toBeDefined();
    expect(ev.findCase("2099다99999")).toBeUndefined();
  });

  test("판례 원문 텍스트는 상세(판시사항·요지)를 쓰고, 목록 항목이 상세를 덮지 않는다", () => {
    const ev = new EvidenceSet();
    const key = ev.addCase(detail);
    ev.addCase(hit);
    expect(ev.sourceText(key)).toBe("[1] 판시\n[1] 요지");
    expect(ev.sourceText("case:없음")).toBe("");
  });
});
