"use client";
// 보관함 정리 /research/shelf (DEC-075 ⓒ): 담아 둔 판례·법령 자료를 폴더로 묶고, 메모를 달고, 인용 목록을 복사하거나 파일로 저장한다.
// 모두 이 기기(localStorage hz:pins) 안에서만 하고 서버로 보내지 않는다 — 공개 자료의 제목·주소·인용 표기와 사용자가 적은 폴더·메모뿐이다.
// AI 없음, 관련도·유불리 판단 없음.
import Link from "next/link";
import { useState } from "react";
import { PAGE_TITLE } from "@/components/ui/styles";
import { FOLDER_MAX, MEMO_MAX, removePin, updatePin, usePins, type RecentItem } from "./recent";
import {
  EXPORT_FORMATS,
  NO_FOLDER,
  exportShelf,
  folderNames,
  groupByFolder,
  type ExportFormat,
} from "./shelf";
import { SearchCredit } from "./parts";
import { SendToMatter } from "./SendToMatter";

const panel = "border-line rounded-[12px] border bg-white";
const input =
  "border-line text-ink min-h-11 rounded-[8px] border bg-white px-3 text-sm outline-none focus:border-gold";
const NEW = "__new__";

function FolderPicker({ item, folders }: { item: RecentItem; folders: string[] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  if (adding)
    return (
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          updatePin(item.href, { folder: name });
          setAdding(false);
          setName("");
        }}
      >
        <input
          aria-label="새 폴더 이름"
          autoFocus
          maxLength={FOLDER_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 보증금 사건"
          className={`${input} w-40`}
        />
        <button type="submit" className="text-link min-h-11 px-1 text-sm font-semibold">
          만들기
        </button>
        <button
          type="button"
          onClick={() => setAdding(false)}
          className="text-muted min-h-11 px-1 text-sm"
        >
          취소
        </button>
      </form>
    );
  return (
    <select
      aria-label={`${item.title} 폴더`}
      value={item.folder ?? ""}
      onChange={(e) => {
        if (e.target.value === NEW) setAdding(true);
        else updatePin(item.href, { folder: e.target.value || null });
      }}
      className={input}
    >
      <option value="">{NO_FOLDER}</option>
      {folders.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
      <option value={NEW}>+ 새 폴더</option>
    </select>
  );
}

function Memo({ item }: { item: RecentItem }) {
  const [text, setText] = useState(item.memo ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <label className="mt-2 block">
      <span className="text-label text-[12px] font-bold">메모</span>
      <textarea
        value={text}
        maxLength={MEMO_MAX}
        rows={2}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        onBlur={() => {
          if ((item.memo ?? "") === text.trim()) return;
          updatePin(item.href, { memo: text });
          setSaved(true);
        }}
        placeholder="이 자료를 왜 담았는지 적어 두세요 (이 기기에만 저장)"
        className="border-line text-ink focus:border-gold mt-1 w-full rounded-[8px] border bg-white px-3 py-2 text-sm outline-none"
      />
      {saved && <span className="text-muted text-[12px]">저장했어요</span>}
    </label>
  );
}

function Exporter({ items, scope }: { items: RecentItem[]; scope: string }) {
  const [format, setFormat] = useState<ExportFormat>("citations");
  const [msg, setMsg] = useState("");
  const text = () => exportShelf(items, format, window.location.origin);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      setMsg("복사했어요");
    } catch {
      setMsg("복사하지 못했어요. 파일로 저장해 보세요.");
    }
  };
  const save = () => {
    const ext = format === "markdown" ? "md" : "txt";
    const blob = new Blob([text()], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `보관함-${scope}.${ext}`.replace(/[\\/:*?"<>|]/g, "_");
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("파일로 저장했어요");
  };
  return (
    <section aria-label="내보내기" className={`${panel} p-4`}>
      <h2 className="text-ink text-sm font-bold">내보내기 · {scope}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="내보내기 형식"
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
          className={input}
        >
          {EXPORT_FORMATS.map((f) => (
            <option key={f.format} value={f.format}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={items.length === 0}
          onClick={() => void copy()}
          className="bg-ink rounded-button min-h-11 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          복사
        </button>
        <button
          type="button"
          disabled={items.length === 0}
          onClick={save}
          className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-sm font-semibold disabled:opacity-50"
        >
          파일로 저장
        </button>
        {msg && (
          <span aria-live="polite" className="text-muted text-[13px]">
            {msg}
          </span>
        )}
      </div>
      <p className="text-muted mt-2 text-[12px] leading-relaxed">
        인용 표기는 담을 때 법제처가 준 법원·날짜·번호를 이어 붙인 그대로예요. 제출하실 곳의 표기
        방식을 한 번 더 확인해 주세요.
      </p>
    </section>
  );
}

export function ShelfPage() {
  const pins = usePins();
  const folders = folderNames(pins);
  const [view, setView] = useState<string>("");
  const shown = view ? pins.filter((p) => (p.folder ?? NO_FOLDER) === view) : pins;
  const groups = groupByFolder(shown);
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 lg:py-12">
      <Link href="/research" className="text-link text-sm underline-offset-2 hover:underline">
        ← 판례 리서치
      </Link>
      <section className="rounded-panel border-line mt-4 border bg-white px-[18px] py-[20px] lg:px-8 lg:py-7">
        <h1 className={PAGE_TITLE}>보관함 정리</h1>
        <p className="text-muted mt-2 text-sm leading-relaxed">
          담아 둔 자료를 폴더로 묶고 메모를 달아 두세요. 폴더·메모는 이 기기에만 저장하고 서버로
          보내지 않아요. 메모에는 이름·연락처 같은 개인정보를 적지 않는 걸 권해요.
        </p>
        {pins.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="폴더">
            {["", ...folders, ...(pins.some((p) => !p.folder) ? [NO_FOLDER] : [])].map((f) => (
              <li key={f || "all"}>
                <button
                  type="button"
                  aria-pressed={view === f}
                  onClick={() => setView(f)}
                  className={`flex min-h-11 items-center rounded-full border px-4 text-sm ${
                    view === f
                      ? "border-gold bg-honey text-ink font-semibold"
                      : "border-line text-ink bg-white"
                  }`}
                >
                  {f || "전체"}{" "}
                  <span className="text-muted ml-1">
                    {f ? pins.filter((p) => (p.folder ?? NO_FOLDER) === f).length : pins.length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pins.length === 0 ? (
        <p className="text-muted mt-6 text-sm leading-relaxed">
          아직 담은 자료가 없어요. 판례 검색·리서치나 판례 상세에서 &lsquo;보관함에 담기&rsquo;를
          눌러 보세요.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-5">
            {groups.map((g) => (
              <section key={g.folder} aria-label={`폴더 ${g.folder}`}>
                <h2 className="text-ink text-[15px] font-bold">
                  {g.folder} <span className="text-gold">{g.items.length}</span>
                </h2>
                <ul className="mt-2 grid gap-2">
                  {g.items.map((p) => (
                    <li key={p.href} className={`${panel} p-4`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-gold text-[12px] font-bold">{p.kind}</p>
                          <Link
                            href={p.href}
                            className="text-ink text-[15px] font-semibold underline-offset-2 hover:underline"
                          >
                            {p.title}
                          </Link>
                          <p className="text-muted text-[13px]">{p.sub}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <FolderPicker item={p} folders={folders} />
                          <button
                            type="button"
                            onClick={() => removePin(p.href)}
                            className="text-muted min-h-11 px-1 text-sm underline-offset-2 hover:underline"
                          >
                            빼기
                          </button>
                        </div>
                      </div>
                      <Memo key={`${p.href}|${p.memo ?? ""}`} item={p} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <aside className="grid h-fit gap-4 lg:sticky lg:top-[86px]">
            <Exporter items={shown} scope={view || "전체"} />
            {/* 사건 진행 노트로 보내기 (DEC-075 ⓓ, 로그인) */}
            <SendToMatter items={shown} scope={view || "전체"} />
          </aside>
        </div>
      )}
      <SearchCredit />
    </div>
  );
}
