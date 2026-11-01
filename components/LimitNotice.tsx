"use client";
// 3회 안내 (S-06 자리). 비로그인 3회를 다 쓰면 서버가 LOGIN_REQUIRED로 막는다 (DEC-005, DEC-010).
// 데모는 무료 모드로 운영하고 소셜 로그인을 열지 않았다 — 로그인 버튼 대신 데모 한도를 그대로 알린다.
import { HamzziJudge } from "./HamzziJudge";
import { Modal, SecondaryButton } from "./Modal";

export const DEMO_LIMIT_TEXT =
  "데모에서는 질문을 3번까지 할 수 있어요(이어 묻기 포함). 지금까지 받은 결과는 이 창에서 뒤로 가기로 다시 볼 수 있어요.";

export function LimitNotice({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="질문 3번을 모두 썼어요" onClose={onClose}>
      <div className="flex justify-center">
        <HamzziJudge size={120} interactive={false} />
      </div>
      <p className="text-muted mt-3 text-[15px] leading-relaxed">{DEMO_LIMIT_TEXT}</p>
      <div className="mt-5 flex flex-col gap-2">
        <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
      </div>
    </Modal>
  );
}
