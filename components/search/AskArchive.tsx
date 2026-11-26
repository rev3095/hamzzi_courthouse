"use client";
// 판례 아카이브 질문창 (DEC-070, 2026-11-27 사용자 결정): 판례 상세에서 이 판례에 대해 묻는다.
// DEC-076(2026-11-27): 검색·리서치 화면에서는 '물어보기'가 곧 AI Light 답(components/search/SearchAnswer)이라 이 단추를 뺐다.
// 판례 상세에만 남기고, 이름도 '궁금한 점 바로 묻기 · AI Light'에서 '이 판례 물어보기'로 바꿨다.
// 검색 결과 자체는 지금처럼 AI 없이 법제처 자료만 보이고(SEARCH_NOTICE), 질문만 상담과 같은 길(POST /inquiries → 결과 화면)로 간다 —
// 개인정보 가리기·민감정보 동의·하루 질문 횟수·비용 상한·인용 검증·AI 고지가 그대로 걸린다.
// 답변 단계는 고르지 않는다: 화면도 서버도 Light(Haiku 5.5)로 고정한다. 보고 있던 판례가 있으면 그 판례를 근거에 넣을 수 있다
// (법제처 일련번호만 이 기기에 남기고, 분석 때 서버가 법제처에서 다시 가져온다).
import { useState } from "react";
import { isQuotaBlocked, rememberArchive } from "@/lib/client/api";
import { Modal } from "../Modal";
import { QuestionBox } from "../ask/QuestionBox";
import { useAsk } from "../ask/useAsk";
import { useQuota } from "../useQuota";

export type AskFocus = { id: string; title: string };

export function AskArchive({ focus = null }: { focus?: AskFocus | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-button border-gold bg-honey text-ink inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-semibold"
      >
        {focus ? "이 판례 물어보기" : "물어보기"}
      </button>
      {/* 질문 보내기 흐름(라우터·남은 횟수)은 창을 열 때만 붙인다 */}
      {open && <AskPanel focus={focus} onClose={() => setOpen(false)} />}
    </>
  );
}

function AskPanel({ focus, onClose }: { focus: AskFocus | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [useFocus, setUseFocus] = useState(true);
  const ask = useAsk();
  const quota = useQuota();

  const submit = () => {
    if (isQuotaBlocked(quota)) {
      ask.showLimit();
      return;
    }
    const ids = focus && useFocus ? [focus.id] : [];
    void ask.send(text, false, false, (id) => rememberArchive(id, ids));
  };

  // 개인정보·동의·횟수 안내 창이 뜨면 질문창은 잠시 가린다 (창 두 개가 겹치지 않게)
  if (ask.modals) return ask.modals;
  return (
    <Modal
      title={focus ? "이 판례에 대해 물어보기" : "판례·법령에 대해 물어보기"}
      onClose={onClose}
    >
      <p className="text-muted text-[14px] leading-relaxed">
        AI가 먼저 답하고, 답변 속 조문·판례는 법제처에서 확인해요. 근거로 고른 판례는 답변에 함께
        넘겨요. 답변은 Light(Haiku 5.5)로 고정이고, 하루 질문 횟수에서 한 번 세요. 이름·전화번호
        같은 개인정보는 가린 뒤에 보내요.
      </p>
      {focus && (
        <label className="text-ink bg-soft mt-3 flex min-h-11 items-start gap-2.5 rounded-[8px] px-3 py-2.5 text-[14px]">
          <input
            type="checkbox"
            checked={useFocus}
            onChange={(e) => setUseFocus(e.target.checked)}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            이 판례를 근거에 넣기
            <span className="text-muted block text-[13px]">{focus.title}</span>
          </span>
        </label>
      )}
      <div className="mt-3">
        <QuestionBox
          value={text}
          onChange={setText}
          onSubmit={submit}
          busy={ask.busy}
          size="md"
          label="궁금한 점"
          placeholder={
            focus
              ? "예: 이 판례는 어떤 요건을 따졌나요?"
              : "예: 전세 보증금을 못 돌려받으면 어떤 절차가 있나요?"
          }
        />
      </div>
      {ask.error && (
        <p role="alert" className="text-warn-text mt-2 text-sm">
          {ask.error}
        </p>
      )}
      <p className="text-muted mt-2 text-[12px]">
        보내면 상담 결과 화면에서 답이 나와요. 검색 결과 목록은 AI 없이 그대로예요.
      </p>
    </Modal>
  );
}
