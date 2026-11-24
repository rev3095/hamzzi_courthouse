// DEC-062 가상 문서 거르기 — 개인정보 꼴·단정 표현·사연에 없는 숫자가 든 칸은 빠진다
import { describe, expect, it } from "vitest";
import { parseVirtualDoc, screenVirtualDoc } from "./virtual";

const q = "임대인이 보증금 1,500,000원을 돌려주지 않아요.";
const doc = (sections: { heading: string; body: string }[], kind = "complaint") => ({
  kind,
  title: "임대차보증금 반환 청구의 소",
  sections,
});

describe("DEC-062 가상 문서", () => {
  it("정해진 서식 종류가 아니면 내지 않는다", () => {
    expect(
      screenVirtualDoc(
        doc(
          [
            { heading: "청구취지", body: "피고는 원고에게 금 1,500,000원을 지급하라." },
            { heading: "청구원인", body: "원고는 피고에게 보증금을 지급하였습니다." },
          ],
          "made-up",
        ),
        q,
      ),
    ).toBeNull();
  });

  it("사연에 없는 금액·연락처·단정 표현이 든 칸은 뺀다", () => {
    const d = screenVirtualDoc(
      doc([
        { heading: "청구취지", body: "피고는 원고에게 금 1,500,000원을 지급하라." },
        { heading: "지연손해금", body: "연 12%의 비율로 계산한 돈을 지급하라." },
        { heading: "연락처", body: "010-1234-5678" },
        { heading: "결론", body: "원고는 반드시 승소합니다." },
        { heading: "계약 경위", body: "원고는 2025년 5월부터 피고의 주택에 살았습니다." },
        { heading: "독촉", body: "원고는 두 달 동안 반환을 요구했습니다." },
        {
          heading: "법적 근거",
          body: "주택임대차보호법 제3조의2 제2항에 따라 보증금을 청구합니다.",
        },
      ]),
      q,
    );
    expect(d?.sections.map((s) => s.heading)).toEqual(["청구취지", "법적 근거"]);
    expect(d?.formTitle).toBeTruthy();
  });

  it("남은 칸이 둘보다 적으면 내지 않는다", () => {
    expect(
      screenVirtualDoc(
        doc([{ heading: "청구취지", body: "피고는 원고에게 보증금을 돌려주라." }]),
        q,
      ),
    ).toBeNull();
  });

  it("저장된 문서 형식 확인", () => {
    expect(
      parseVirtualDoc({ kind: "complaint", formTitle: "소장", title: "t", sections: [] }),
    ).toBeNull();
    expect(
      parseVirtualDoc({
        kind: "complaint",
        formTitle: "소장",
        title: "t",
        sections: [{ heading: "h", body: "b" }],
      })?.kind,
    ).toBe("complaint");
  });
});
