"use client";
// 로그인 안내 (S-06). 비로그인 3회를 다 쓰면 서버가 LOGIN_REQUIRED로 막는다 (DEC-005, DEC-010).
// 데모에는 소셜 로그인이 아직 연결되지 않아 안내만 한다 — 로그인 연결은 Supabase Auth 공급자 설정 후.
import { Modal, SecondaryButton } from "./Modal";
import { HamzziJudge } from "./HamzziJudge";

export function LoginNotice({
  reason,
  onClose,
}: {
  reason: "quota" | "header";
  onClose: () => void;
}) {
  return (
    <Modal
      title={reason === "quota" ? "무료 질문 3번을 모두 썼어요" : "로그인은 곧 열려요"}
      onClose={onClose}
    >
      <div className="flex justify-center">
        <HamzziJudge size={120} interactive={false} />
      </div>
      <p className="text-muted mt-3 text-[15px] leading-relaxed">
        {reason === "quota"
          ? "로그인하면 계속 물어볼 수 있어요. 지금은 데모 기간이라 로그인을 준비하고 있어요. 지금까지 받은 결과는 이 창에서 다시 볼 수 있어요."
          : "데모 기간에는 로그인 없이 3번까지 물어볼 수 있어요. 소셜 로그인은 준비가 끝나면 열어 드릴게요."}
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          disabled
          className="rounded-button border-line bg-soft text-muted min-h-11 border px-5 text-[15px]"
        >
          소셜 로그인 (준비 중)
        </button>
        <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
      </div>
    </Modal>
  );
}
