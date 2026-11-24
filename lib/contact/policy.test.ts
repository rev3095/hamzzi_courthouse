// 문의 남기기 순수 규칙 (DEC-051)
import { describe, expect, test } from "vitest";
import {
  buildContactMail,
  CONTACT_LIMITS,
  contactMailto,
  developerEmail,
  MAILTO_BODY_MAX,
  parseContact,
} from "./policy";

describe("parseContact (DEC-051)", () => {
  test("종류를 빼면 기타, 답장 주소는 선택", () => {
    expect(parseContact({ body: "  열 글자가 넘는 문의예요  " })).toEqual({
      value: { topic: "other", body: "열 글자가 넘는 문의예요", replyTo: null },
    });
  });

  test("길이 경계", () => {
    expect(parseContact({ body: "가".repeat(CONTACT_LIMITS.bodyMin) })).toHaveProperty("value");
    expect(parseContact({ body: "가".repeat(CONTACT_LIMITS.bodyMax) })).toHaveProperty("value");
    expect(parseContact({ body: "가".repeat(CONTACT_LIMITS.bodyMax + 1) })).toHaveProperty("error");
  });

  test("본문이 문자열이 아니면 빈 입력", () => {
    expect(parseContact({ body: 42 })).toEqual({
      error: { code: "EMPTY_INPUT", fields: ["body"], reason: "empty" },
    });
  });
});

describe("메일·mailto (DEC-051)", () => {
  test("메일에는 가린 개수만 적고 저장하지 않았다고 적는다", () => {
    const mail = buildContactMail("bug", "[전화번호] 로 연락", 1, null);
    expect(mail.text).toContain("1곳");
    expect(mail.text).toContain("저장하지 않았습니다");
  });

  test("mailto는 개발자 메일로, 긴 본문은 자른다", () => {
    const href = contactMailto("[햄찌법원 문의] 기타", "가".repeat(MAILTO_BODY_MAX + 50));
    expect(href.startsWith(`mailto:${developerEmail()}?subject=`)).toBe(true);
    const body = decodeURIComponent(href.split("&body=")[1]);
    expect(body.length).toBe(MAILTO_BODY_MAX + 1);
  });
});
