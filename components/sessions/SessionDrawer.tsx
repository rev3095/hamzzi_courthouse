"use client";
// 내 세션 사이드바 (DEC-070 ②, 2026-11-27 사용자 요청): 헤더 왼쪽 단추로 여는 왼쪽 서랍. 모든 화면에서 같은 목록을 본다.
// - 대화: 비로그인은 이 브라우저에 둔 목록(lib/client/local-sessions, 가린 문장만), 로그인은 계정에 남긴 질문(GET /me/inquiries).
// - 사건: '사건' 묶음을 누르면 내 사건 목록이 펼쳐진다(로그인 사용자만 — 사건 진행은 로그인 전용, DEC-053).
// 세션마다 이름 바꾸기·삭제가 있다. 질문 삭제는 목록에서 빼기이고(질문·결과는 그대로, 횟수 되살아나지 않음),
// 사건 삭제는 사건 자료를 지운다(두 번 눌러 확인). 판정·평가 항목은 없다. Figma에 없는 배치라 브랜드 토큰으로 그렸다.
import Link from "next/link";
import { AI_NOTICE } from "@/lib/api/respond";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  getMyInquiries,
  isSignedIn,
  removeMyInquiry,
  renameMyInquiry,
  rememberQuestion,
  type SavedInquiry,
} from "@/lib/client/api";
import {
  removeLocalSession,
  renameLocalSession,
  useLocalSessions,
} from "@/lib/client/local-sessions";
import { deleteMatter, listMatters, saveMatter } from "@/lib/client/matters";
import { matterHref } from "@/lib/client/sessions";
import { MATTER_FIELD_LABEL, type MatterSummary } from "@/lib/matters/model";
import { useQuota } from "../useQuota";

type Row = {
  id: string;
  label: string;
  /** 이름을 바꿨을 때 원래 글 (마우스를 올리면 보인다) */
  sub?: string;
  tag?: string | null;
};

function SessionRow({
  row,
  onOpen,
  onRename,
  onDelete,
  deleteLabel,
  confirmLabel = "한 번 더 누르면 지워요",
}: {
  row: Row;
  onOpen: () => void;
  onRename: (title: string | null) => Promise<boolean>;
  onDelete: () => Promise<void>;
  deleteLabel: string;
  confirmLabel?: string;
}) {
  const [mode, setMode] = useState<"view" | "menu" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState(row.label);
  const [busy, setBusy] = useState(false);

  if (mode === "edit") {
    return (
      <li className="px-2 py-1">
        <form
          className="flex gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const done = await onRename(draft.trim() || null);
            setBusy(false);
            if (done) setMode("view");
          }}
        >
          <input
            autoFocus
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setMode("view")}
            aria-label="세션 이름"
            className="border-line focus:border-ink text-ink min-h-10 w-full rounded-[8px] border bg-white px-2 text-[14px] outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="bg-ink min-h-10 shrink-0 rounded-[8px] px-3 text-[13px] font-bold text-white disabled:opacity-50"
          >
            저장
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="group relative">
      <div className="hover:bg-cream/70 flex items-center rounded-[8px]">
        <button
          type="button"
          onClick={onOpen}
          title={row.sub ?? row.label}
          className="min-h-11 min-w-0 flex-1 px-2.5 text-left"
        >
          <span className="text-ink line-clamp-1 text-[14px]">{row.label}</span>
          {row.tag && <span className="text-muted block text-[11px]">{row.tag}</span>}
        </button>
        <button
          type="button"
          aria-label={`${row.label} 메뉴`}
          aria-expanded={mode !== "view"}
          onClick={() => setMode(mode === "view" ? "menu" : "view")}
          className="text-muted hover:text-ink flex size-9 shrink-0 items-center justify-center rounded-[8px] text-[18px] leading-none"
        >
          ⋯
        </button>
      </div>
      {mode !== "view" && (
        <div className="border-line mx-2 mb-1 flex flex-wrap gap-1 rounded-[8px] border bg-white p-1">
          <button
            type="button"
            className="text-ink hover:bg-cream min-h-9 rounded-[6px] px-2.5 text-[13px] font-semibold"
            onClick={() => {
              setDraft(row.label);
              setMode("edit");
            }}
          >
            이름 바꾸기
          </button>
          <button
            type="button"
            disabled={busy}
            className={`min-h-9 rounded-[6px] px-2.5 text-[13px] font-semibold ${
              mode === "confirm" ? "bg-ink text-white" : "text-ink hover:bg-cream"
            }`}
            onClick={async () => {
              if (mode !== "confirm") return setMode("confirm");
              setBusy(true);
              await onDelete();
              setBusy(false);
              setMode("view");
            }}
          >
            {mode === "confirm" ? confirmLabel : deleteLabel}
          </button>
        </div>
      )}
    </li>
  );
}

const questionRow = (q: { id: string; text: string; title: string | null }): Row => ({
  id: q.id,
  label: q.title || q.text,
  sub: q.title ? q.text : undefined,
});

export function SessionDrawer({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const quota = useQuota();
  const signedIn = isSignedIn(quota);
  const local = useLocalSessions();
  const [saved, setSaved] = useState<SavedInquiry[] | null>(null);
  const [matters, setMatters] = useState<MatterSummary[] | null>(null);
  const [mattersOpen, setMattersOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [qs, ms] = await Promise.all([getMyInquiries(), listMatters()]);
    setSaved(qs.ok && Array.isArray(qs.data) ? qs.data.filter((q) => !q.followup) : []);
    setMatters(ms.ok ? ms.data.items : []);
    if (!qs.ok || !ms.ok) setError("목록 일부를 불러오지 못했어요.");
  }, []);
  useEffect(() => {
    // 로그인 사용자는 열 때마다 계정 목록을 새로 읽는다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (signedIn) void load();
  }, [signedIn, load]);

  // Esc로 닫는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openQuestion = (id: string, text: string) => {
    rememberQuestion(id, text);
    onClose();
    router.push(`/inquiries/${id}`);
  };

  const questions = signedIn
    ? (saved ?? []).map((q) => ({ id: q.id, text: q.maskedText, title: q.title ?? null }))
    : local.map((s) => ({ id: s.id, text: s.text, title: s.title }));

  return (
    <>
      <button
        type="button"
        aria-label="내 세션 닫기"
        onClick={onClose}
        className="bg-ink/40 fixed inset-0 z-50"
      />
      <aside
        aria-label="내 세션"
        data-testid="session-drawer"
        className="border-line bg-soft fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-[320px] flex-col border-r shadow-xl"
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-display text-ink text-[20px] font-bold">내 세션</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted hover:text-ink flex size-11 items-center justify-center text-[22px]"
          >
            ×
          </button>
        </div>
        <div className="px-3 pt-2">
          <Link
            href="/"
            onClick={onClose}
            className="bg-ink flex min-h-11 items-center justify-center rounded-[8px] text-[15px] font-semibold text-white"
          >
            새 질문
          </Link>
        </div>

        <nav aria-label="세션 목록" className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <p className="text-muted px-2.5 pt-2 pb-1 text-[12px] font-bold">대화</p>
          {signedIn && saved === null ? (
            <p className="text-muted px-2.5 py-2 text-[13px]" aria-live="polite">
              불러오는 중…
            </p>
          ) : questions.length === 0 ? (
            <p className="text-muted px-2.5 py-2 text-[13px] leading-relaxed">
              {signedIn
                ? "질문창 아래 '내 기록에 남기기'를 켜고 보낸 질문이 여기에 모여요."
                : "보낸 질문이 여기에 모여요."}
            </p>
          ) : (
            <ul>
              {questions.map((q) => (
                <SessionRow
                  key={q.id}
                  row={questionRow(q)}
                  deleteLabel="목록에서 삭제"
                  confirmLabel="한 번 더 누르면 목록에서 빼요"
                  onOpen={() => openQuestion(q.id, q.text)}
                  onRename={async (title) => {
                    if (!signedIn) {
                      renameLocalSession(q.id, title);
                      return true;
                    }
                    const r = await renameMyInquiry(q.id, title);
                    if (!r.ok) {
                      setError("이름을 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.");
                      return false;
                    }
                    setSaved((list) =>
                      (list ?? []).map((x) => (x.id === q.id ? { ...x, title: r.data.title } : x)),
                    );
                    return true;
                  }}
                  onDelete={async () => {
                    if (!signedIn) return removeLocalSession(q.id);
                    const r = await removeMyInquiry(q.id);
                    if (r.ok) setSaved((list) => (list ?? []).filter((x) => x.id !== q.id));
                    else setError("목록에서 빼지 못했어요. 잠시 뒤 다시 해 주세요.");
                  }}
                />
              ))}
            </ul>
          )}

          <button
            type="button"
            aria-expanded={mattersOpen}
            onClick={() => setMattersOpen(!mattersOpen)}
            className="hover:bg-cream/70 mt-3 flex min-h-11 w-full items-center justify-between rounded-[8px] px-2.5 text-left"
          >
            <span className="text-ink text-[14px] font-bold">
              사건
              {signedIn && matters && matters.length > 0 && (
                <span className="text-muted ml-1.5 text-[12px] font-semibold">
                  {matters.length}
                </span>
              )}
            </span>
            <span aria-hidden="true" className="text-muted text-[12px]">
              {mattersOpen ? "▾" : "▸"}
            </span>
          </button>
          {mattersOpen &&
            (!signedIn ? (
              <p className="text-muted px-2.5 py-2 text-[13px] leading-relaxed">
                사건은 로그인한 뒤 만들어 계정에 저장해요.{" "}
                <Link href="/matters" onClick={onClose} className="text-link underline">
                  가상 사건 둘러보기
                </Link>
              </p>
            ) : matters === null ? (
              <p className="text-muted px-2.5 py-2 text-[13px]" aria-live="polite">
                불러오는 중…
              </p>
            ) : matters.length === 0 ? (
              <p className="text-muted px-2.5 py-2 text-[13px]">
                아직 사건이 없어요.{" "}
                <Link href="/matters" onClick={onClose} className="text-link underline">
                  사건 만들기
                </Link>
              </p>
            ) : (
              <ul className="border-line ml-2.5 border-l pl-1">
                {matters.map((m) => (
                  <SessionRow
                    key={m.id}
                    row={{
                      id: m.id,
                      label: m.title,
                      tag: m.field ? MATTER_FIELD_LABEL[m.field] : null,
                    }}
                    deleteLabel="사건 삭제"
                    onOpen={() => {
                      onClose();
                      router.push(matterHref(m.id));
                    }}
                    onRename={async (title) => {
                      if (!title) return false;
                      const r = await saveMatter(m.id, { title });
                      if (!r.ok) {
                        setError("이름을 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.");
                        return false;
                      }
                      // 서버가 연락처 꼴을 가린 이름으로 다시 읽는다
                      void load();
                      return true;
                    }}
                    onDelete={async () => {
                      const r = await deleteMatter(m.id);
                      if (r.ok) setMatters((list) => (list ?? []).filter((x) => x.id !== m.id));
                      else setError("사건을 지우지 못했어요. 잠시 뒤 다시 해 주세요.");
                    }}
                  />
                ))}
              </ul>
            ))}
          {mattersOpen && signedIn && matters?.some((m) => m.field) && (
            <p className="text-muted px-2.5 pt-1 text-[11px]">분야·사건 이름 일부: {AI_NOTICE}</p>
          )}
          {error && (
            <p role="alert" className="text-warn-text px-2.5 pt-3 text-[13px]">
              {error}
            </p>
          )}
        </nav>

        <p className="border-line text-muted border-t px-4 py-3 text-[12px] leading-relaxed">
          {signedIn
            ? "내 계정에 저장된 목록이에요. 질문 삭제는 목록에서만 빼고, 기록을 모두 지우려면 마이페이지 '내 기록'을 써 주세요."
            : "이 브라우저에만 저장되는 목록이에요(가린 질문 문장과 붙인 이름만). 로그인하면 '내 기록에 남기기'로 계정에 저장해요."}
        </p>
      </aside>
    </>
  );
}
