"use client";
// 보관함 → 사건 진행 노트 (DEC-075 ⓓ): 로그인 사용자가 담아 둔 공개 자료를 본인 사건의 노트(종류 '법령·판례')로 보낸다.
// 새 API는 없다 — 기존 GET /matters · GET·PUT /matters/{id}(본인 사건만, 서버가 MatterDataZ로 다시 검사)를 쓴다.
// AI를 부르지 않는다. 로그인 전에는 안내만 보인다 (사건 진행은 로그인 전용, DEC-053).
import Link from "next/link";
import { useEffect, useState } from "react";
import { isSignedIn } from "@/lib/client/api";
import { getMatter, listMatters, matterErrorText, saveMatter } from "@/lib/client/matters";
import type { MatterSummary } from "@/lib/matters/model";
import { useQuota } from "../useQuota";
import type { RecentItem } from "./recent";
import { appendShelfNotes } from "./to-matter";

const input =
  "border-line text-ink min-h-11 w-full rounded-[8px] border bg-white px-3 text-sm outline-none focus:border-gold";

type Done = { matterId: string; added: number; duplicate: number; overLimit: number };

export function SendToMatter({ items, scope }: { items: RecentItem[]; scope: string }) {
  const quota = useQuota();
  const signedIn = isSignedIn(quota);
  const [matters, setMatters] = useState<MatterSummary[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void listMatters().then((r) => {
      if (!alive) return;
      if (r.ok) setMatters(r.data.items);
      else setError(matterErrorText(r.error.code, r.error.details?.reason));
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  const send = async () => {
    if (!pick || items.length === 0) return;
    setBusy(true);
    setError("");
    setDone(null);
    const got = await getMatter(pick);
    if (!got.ok) {
      setBusy(false);
      setError(matterErrorText(got.error.code, got.error.details?.reason));
      return;
    }
    const next = appendShelfNotes(got.data.data, items, window.location.origin);
    if (next.added > 0) {
      const saved = await saveMatter(pick, { data: next.data });
      if (!saved.ok) {
        setBusy(false);
        setError(matterErrorText(saved.error.code, saved.error.details?.reason));
        return;
      }
    }
    setBusy(false);
    setDone({ matterId: pick, ...next });
  };

  return (
    <section
      aria-label="사건 노트로 보내기"
      className="border-line rounded-[12px] border bg-white p-4"
    >
      <h2 className="text-ink text-sm font-bold">사건 노트로 보내기 · {scope}</h2>
      {!signedIn ? (
        <p className="text-muted mt-2 text-[13px] leading-relaxed">
          로그인하면 담은 자료를 사건 진행의 노트로 보낼 수 있어요.{" "}
          <Link
            href="/matters"
            className="text-link font-semibold underline-offset-2 hover:underline"
          >
            사건 진행 →
          </Link>
        </p>
      ) : matters === null && !error ? (
        <p className="text-muted mt-2 text-[13px]">내 사건을 불러오고 있어요…</p>
      ) : matters && matters.length === 0 ? (
        <p className="text-muted mt-2 text-[13px] leading-relaxed">
          아직 사건이 없어요.{" "}
          <Link
            href="/matters"
            className="text-link font-semibold underline-offset-2 hover:underline"
          >
            사건 만들기 →
          </Link>
        </p>
      ) : (
        <>
          {matters && (
            <div className="mt-2 flex flex-col gap-2">
              <select
                aria-label="보낼 사건"
                value={pick}
                onChange={(e) => {
                  setPick(e.target.value);
                  setDone(null);
                }}
                className={input}
              >
                <option value="">사건 고르기</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pick || busy || items.length === 0}
                onClick={() => void send()}
                className="bg-ink rounded-button min-h-11 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "보내는 중…" : `${items.length}건 노트로 보내기`}
              </button>
            </div>
          )}
          <p className="text-muted mt-2 text-[12px] leading-relaxed">
            자료마다 노트 한 건이 돼요(제목·인용 표기·메모·이 사이트 주소). 이미 보낸 자료는 다시
            넣지 않아요.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-warn-text mt-2 text-[13px]">
          {error}
        </p>
      )}
      {done && (
        <p aria-live="polite" className="text-ink mt-2 text-[13px] leading-relaxed">
          {done.added > 0 ? `노트 ${done.added}건을 붙였어요.` : "새로 붙인 노트가 없어요."}
          {done.duplicate > 0 && ` 이미 보낸 ${done.duplicate}건은 건너뛰었어요.`}
          {done.overLimit > 0 && ` 노트 한도가 차서 ${done.overLimit}건은 넣지 못했어요.`}{" "}
          <Link
            href={`/matters?open=${encodeURIComponent(done.matterId)}`}
            className="text-link font-semibold underline-offset-2 hover:underline"
          >
            사건 열기 →
          </Link>
        </p>
      )}
    </section>
  );
}
