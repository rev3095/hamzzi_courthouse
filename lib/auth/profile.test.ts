// @vitest-environment node
// DEC-056 마이페이지 프로필: Google 이름·사진 주소 고르기. 이름은 모두 가상이다.
import { describe, expect, test } from "vitest";
import { PROFILE_NAME_CHARS, greeting, profileView } from "./profile";

describe("DEC-056 마이페이지 프로필", () => {
  test("Google user_metadata에서 이름과 사진 주소를 고른다", () => {
    expect(
      profileView({
        full_name: "  햄찌   테스트 ",
        avatar_url: "https://lh3.googleusercontent.com/a/abc=s96-c",
        email: "someone@example.com",
      }),
    ).toEqual({ name: "햄찌 테스트", avatarUrl: "https://lh3.googleusercontent.com/a/abc=s96-c" });
  });

  test("full_name이 없으면 name, avatar_url이 없으면 picture를 쓴다", () => {
    expect(
      profileView({ name: "가상이름", picture: "https://lh4.googleusercontent.com/x" }),
    ).toEqual({ name: "가상이름", avatarUrl: "https://lh4.googleusercontent.com/x" });
  });

  test("이메일은 돌려주지 않는다", () => {
    expect(Object.keys(profileView({ email: "a@b.c" })).sort()).toEqual(["avatarUrl", "name"]);
  });

  test("값이 없거나 모양이 다르면 null", () => {
    expect(profileView(null)).toEqual({ name: null, avatarUrl: null });
    expect(profileView({ full_name: 3, avatar_url: ["x"] })).toEqual({
      name: null,
      avatarUrl: null,
    });
    expect(profileView({ full_name: "   " }).name).toBeNull();
  });

  test("Google 프로필 사진 호스트의 https 주소만 받는다", () => {
    const av = (u: string) => profileView({ avatar_url: u }).avatarUrl;
    expect(av("http://lh3.googleusercontent.com/a")).toBeNull();
    expect(av("https://example.com/a.png")).toBeNull();
    expect(av("https://googleusercontent.com.evil.example/a")).toBeNull();
    expect(av("javascript:alert(1)")).toBeNull();
    expect(av("not a url")).toBeNull();
  });

  test("이름의 제어 문자·꺾쇠를 빼고 길이를 맞춘다", () => {
    expect(profileView({ full_name: "<b>가상</b>\u0007" }).name).toBe("b가상/b");
    const long = profileView({ full_name: "가".repeat(100) }).name!;
    expect(long.length).toBe(PROFILE_NAME_CHARS);
    expect(long.endsWith("…")).toBe(true);
  });

  test("인사말: 이름이 없으면 회원님", () => {
    expect(greeting("가상이름")).toBe("가상이름님, 안녕하세요");
    expect(greeting(null)).toBe("회원님, 안녕하세요");
  });
});
