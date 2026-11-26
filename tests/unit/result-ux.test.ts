// UI·UX 개정 PR 4 (DEC-067): 결과 없음 '다시 적어 보기'가 쓰던 질문을 홈 질문창에 한 번만 되돌린다
import { beforeEach, expect, test } from "vitest";
import { stashDraft, takeDraft } from "@/lib/client/api";

beforeEach(() => sessionStorage.clear());

test("건넨 질문은 한 번 읽으면 지워진다 (주소에 싣지 않는다)", () => {
  stashDraft("보증금을 못 받았어요");
  expect(takeDraft()).toBe("보증금을 못 받았어요");
  expect(takeDraft()).toBeNull();
});
