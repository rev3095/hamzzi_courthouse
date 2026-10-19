// @vitest-environment node
import { describe, expect, test } from "vitest";
import { maskPii } from "./detect";
import { scanInput } from "./index";
import { detectSensitive } from "./sensitive";

describe("F-007 AC1 이름·전화·주민번호·계좌 패턴 마스킹", () => {
  const raw =
    "중고거래에서 김철수 씨한테 사기를 당했어요. 연락처 010-1234-5678, " +
    "주민번호 900101-1234567이라고 했고 국민은행 123456-01-234567로 30만원 보냈습니다.";

  test("F-007 AC1 네 가지 패턴을 모두 가리고 유형별 개수만 남긴다", () => {
    const { maskedText, findings } = maskPii(raw);
    expect(maskedText).toBe(
      "중고거래에서 [이름1] 씨한테 사기를 당했어요. 연락처 [전화번호], " +
        "주민번호 [주민번호]이라고 했고 국민은행 [계좌번호]로 30만원 보냈습니다.",
    );
    expect(findings).toEqual([
      { type: "name", count: 1 },
      { type: "phone", count: 1 },
      { type: "rrn", count: 1 },
      { type: "account", count: 1 },
    ]);
  });

  test("F-007 AC1 결과 어디에도 원래 값이 남지 않는다", () => {
    const out = JSON.stringify(scanInput(raw));
    for (const v of ["김철수", "010-1234-5678", "900101", "123456-01-234567"]) {
      expect(out).not.toContain(v);
    }
  });

  test("같은 사람은 같은 번호로, 다른 사람은 다른 번호로 가린다", () => {
    const { maskedText } = maskPii(
      "집주인 최영호가 보증금을 안 줘요. 최영호 씨 말로는 친구 박민수한테 줬대요.",
    );
    expect(maskedText).toBe(
      "집주인 [이름1]가 보증금을 안 줘요. [이름1] 씨 말로는 친구 [이름2]한테 줬대요.",
    );
  });

  test("명시한 이름·이메일·주소·동호수도 가린다", () => {
    const { maskedText, findings } = maskPii(
      "제 이름은 홍길동이에요. hong@example.com, 서울특별시 강남구 테헤란로 123, 101동 1203호",
    );
    expect(maskedText).toBe("제 이름은 [이름1]이에요. [이메일], [주소], [주소]");
    expect(findings).toEqual([
      { type: "name", count: 1 },
      { type: "email", count: 1 },
      { type: "address", count: 2 },
    ]);
  });

  test("계좌 문맥 뒤 연속 숫자와 카드번호 형식도 가린다", () => {
    expect(maskPii("통장 번호 1002123456789로 입금").maskedText).toBe(
      "통장 번호 [계좌번호]로 입금",
    );
    expect(maskPii("카드 1234-5678-9012-3456").maskedText).toBe("카드 [계좌번호]");
  });

  test("날짜·금액·사건번호·일반 명사는 가리지 않는다", () => {
    const text =
      "2025-10-19에 계약금 3,000,000원을 줬고 임대인이 안 돌려줘요. 사장님 말로는 2025다220329 판례가 있대요. 고객님 상대방이 정부 지원이라고 했어요.";
    expect(maskPii(text)).toEqual({ maskedText: text, findings: [] });
  });
});

describe("F-007 AC2 민감정보 가능성", () => {
  test("F-007 AC2 건강·범죄경력 단어가 있으면 범주를 알려 준다", () => {
    expect(detectSensitive("폭행으로 상해진단서 4주 받았고 정신과 치료 중이에요")).toEqual([
      "health",
    ]);
    expect(detectSensitive("예전에 집행유예 전과가 있는데 불리할까요")).toEqual([
      "criminal_record",
    ]);
  });

  test("F-007 AC2 일반 사건 설명에는 동의를 요구하지 않는다", () => {
    expect(detectSensitive("계약금 500만원을 돌려받지 못했어요")).toEqual([]);
  });

  test("F-007 AC2 범주 이름만 반환하고 일치한 단어는 반환하지 않는다", () => {
    const scan = scanInput("우울증 진단을 받았어요");
    expect(scan.sensitive).toEqual(["health"]);
    expect(JSON.stringify(scan.sensitive)).not.toContain("우울증");
  });
});
