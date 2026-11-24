"use client";
// 질문창의 사진·문서 붙이기 버튼과 붙인 줄 (F-015 서류 분석, F-017 자료 첨부 — DEC-052·055). Figma에 없는 추가 요소.
// noun: 버튼·이름에 붙는 말 (서류 분석만 = "서류", 자료 첨부만 = "자료", 홈 질문창처럼 둘 다 = "자료·서류").
// 미리보기는 브라우저 메모리의 사진을 그대로 보여 주므로 next/image 대신 img를 쓴다 (서버 최적화 대상이 아니다).
import { useId, useRef } from "react";
import { ATTACH_ACCEPT, CASEFILE_LIMITS } from "@/lib/casefile/limits";
import type { Attachments } from "./useAttachments";

export function AttachButton({
  attach,
  disabled,
  noun = "서류",
}: {
  attach: Attachments;
  disabled?: boolean;
  noun?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const full = attach.items.length >= CASEFILE_LIMITS.maxImages;
  return (
    <>
      <input
        ref={input}
        id={id}
        type="file"
        accept={ATTACH_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void attach.add(e.target.files ?? []);
          // 같은 파일을 다시 골라도 change가 나게 비운다
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled || attach.busy || full}
        aria-label={full ? "사진·문서를 더 붙일 수 없어요" : `${noun} 사진·문서 붙이기`}
        title={`${noun} 사진·문서 붙이기 (사진·PDF·한글·워드·파워포인트·엑셀·텍스트)`}
        className="text-ink hover:bg-soft flex w-12 shrink-0 items-center justify-center self-stretch bg-white disabled:opacity-40"
      >
        {attach.busy ? (
          <span className="border-ink/20 border-t-ink size-5 animate-spin rounded-full border-2" />
        ) : (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <rect
              x="3"
              y="4.5"
              width="16"
              height="13"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.7"
            />
            <circle cx="8" cy="9" r="1.6" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M4 15.5l4.2-4 3.3 3 2.5-2.2 4 3.7"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M17 2.5v5M14.5 5h5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
    </>
  );
}

export function AttachTray({ attach, noun = "서류" }: { attach: Attachments; noun?: string }) {
  if (attach.items.length === 0 && !attach.error) return null;
  return (
    <div className="border-line mx-1 mt-1 border-t px-2 pt-2 pb-1" data-testid="attach-tray">
      {attach.items.length > 0 && (
        <>
          <ul className="flex flex-wrap gap-2" aria-label={`붙인 ${noun} 사진·문서`}>
            {attach.items.map((img, i) => (
              <li key={img.id} className="relative">
                {img.kind === "pdf" || img.kind === "text" ? (
                  <div
                    title={img.name}
                    className="border-line bg-soft text-ink flex size-[68px] flex-col items-center justify-center rounded-[8px] border px-1 text-center"
                  >
                    <span className="text-[13px] font-bold uppercase">
                      {img.name.split(".").pop()?.slice(0, 4) || "문서"}
                    </span>
                    <span className="text-muted mt-0.5 line-clamp-2 text-[10px] leading-tight break-all">
                      {img.name}
                    </span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img.previewUrl}
                    alt={`${noun} 사진 ${i + 1}`}
                    className="border-line size-[68px] rounded-[8px] border object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => attach.remove(img.id)}
                  aria-label={`${noun} ${i + 1} 빼기`}
                  className="bg-ink absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full text-white shadow"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path
                      d="M2 2l8 8M10 2l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-muted mt-2 text-[12px] leading-relaxed">
            사진·문서 {attach.items.length}/{CASEFILE_LIMITS.maxImages} · 내용을 읽는 데만 쓰고
            저장하지 않아요. 문서는 글만 꺼내 개인정보를 가린 뒤 읽어요. 보내기 전에 한 번 더 동의를
            받아요.
          </p>
        </>
      )}
      {attach.error && (
        <p role="alert" className="text-warn-text mt-1 text-[13px]">
          {attach.error}
        </p>
      )}
    </div>
  );
}
