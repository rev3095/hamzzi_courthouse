// DEC-064 빠른 답 먼저 — 검증 전 요약의 거르기
import { describe, expect, it } from "vitest";
import { screenQuick } from "./quick-policy";

const q = "전세 보증금 2억 원을 만기 뒤에도 못 받고 있어요. 집주인은 새 세입자가 와야 준대요.";

describe("DEC-064 먼저 보는 요약", () => {
  it("문제 요약·확인할 것·할 일을 남긴다", () => {
    const p = screenQuick(
      {
        summary: "전세 계약이 끝났는데 보증금을 돌려받지 못한 문제로 보여요.",
        checks: ["계약 만료 전에 갱신하지 않겠다는 뜻을 알렸나요?"],
        nextSteps: ["계약서와 집주인과 주고받은 문자를 모아 두세요."],
      },
      q,
    );
    expect(p?.checks).toHaveLength(1);
    expect(p?.nextSteps).toHaveLength(1);
  });

  it("조문 번호·사건번호·단정 표현·사연에 없는 숫자·연락처가 든 줄은 버린다", () => {
    const p = screenQuick(
      {
        summary: "보증금 반환 문제로 보여요.",
        checks: ["주택임대차보호법 제3조의2에 해당하나요?", "대법원 2019다12345 판결과 같나요?"],
        nextSteps: [
          "반드시 이겨요.",
          "두 달 안에 소송을 내세요.",
          "3억 원을 청구하세요.",
          "010-1234-5678로 연락하세요.",
          "2026. 12. 31.까지 신고해 두세요.",
          "제2항에 따라 요구하세요.",
          "이틀 안에 내용증명을 보내 두세요.",
          "백만 원 정도를 청구해 보세요.",
          "이길 가능성이 높아요.",
          "2억 원 반환을 내용증명으로 요구해 보세요.",
        ],
      },
      q,
    );
    expect(p?.checks).toEqual([]);
    expect(p?.nextSteps).toEqual(["2억 원 반환을 내용증명으로 요구해 보세요."]);
  });

  it("요약 문장이 걸리면 미리보기를 내지 않는다", () => {
    expect(
      screenQuick({ summary: "민법 제618조 문제예요.", checks: [], nextSteps: [] }, q),
    ).toBeNull();
  });
});
