"use client";
// 내 기록에 남기기 (DEC-039): 로그인 사용자에게만 보이는 체크박스. 켜고 보낸 질문과 답변만 마이페이지에 모인다.
// 기본은 꺼짐이고 선택은 이 기기에 기억한다. 예시 질문은 저장 자체를 하지 않아 기록에 남지 않는다.
import { GOOGLE_LOGIN_ENABLED } from "@/lib/client/login";
import { useSave, writeSave } from "@/lib/client/save";
import { useQuota } from "../useQuota";

export function SaveToggle() {
  const quota = useQuota();
  const save = useSave();
  // 비로그인·관리자 모드 질문은 기록에 남지 않는다
  if (!GOOGLE_LOGIN_ENABLED || !quota || quota.anonymous || quota.admin) return null;
  return (
    <label className="text-ink mx-3 mt-1 flex min-h-11 items-center gap-2.5 text-[13px]">
      <input
        type="checkbox"
        checked={save}
        onChange={(e) => writeSave(e.target.checked)}
        className="size-5 accent-[var(--ink)]"
      />
      이 질문과 답변을 내 기록에 남기기
      <span className="text-muted max-sm:hidden">· 가린 문장만 보관해요</span>
    </label>
  );
}
