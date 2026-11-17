"use client";
// 판례 검색 화면 /search (F-003). 질문 3회와 별개 (DEC-017 제안). 관련도 점수는 보이지 않는다 (PRD 8.3).
import Link from "next/link";
import { useState } from "react";
import { searchCases, type CaseList, type ClientError } from "@/lib/client/api";
import { dotDate } from "../result/labels";
import { QuestionBox } from "../ask/QuestionBox";
import { highlightTerms } from "@/lib/search/highlight";
import {
  Highlighted,
  OriginalLink,
  SearchCredit,
  SearchNotice,
  rememberSearch,
  searchErrorText,
} from "./parts";

type State =
  | { kind: "idle" }
  | { kind: "loading"; q: string }
  | { kind: "done"; q: string; data: CaseList }
  | { kind: "error"; q: string; error: ClientError };

export function SearchView() {
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  // 검색어는 주소(?q=)에 두지 않는다 — 브라우저 기록·접속 기록에 남지 않게 (F-007)
  const submit = async () => {
    const q = text.trim();
    if (!q) {
      setState({ kind: "error", q: "", error: { code: "EMPTY_INPUT", message: "" } });
      return;
    }
    setState({ kind: "loading", q });
    const r = await searchCases(q);
    // 서버가 받아 준 검색어만 이 기기에 남긴다 (개인정보로 막힌 검색어는 남기지 않음) — 상세 화면 하이라이트용
    if (r.ok) rememberSearch(q);
    setState(r.ok ? { kind: "done", q, data: r.data } : { kind: "error", q, error: r.error });
  };

  // 검색 결과에서 검색어 낱말을 하이라이트한다 (F-003)
  const terms = state.kind === "done" ? highlightTerms(state.q) : [];

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 lg:py-12">
      <h1 className="font-display text-ink text-[28px] font-bold">판례 검색</h1>
      <p className="text-muted mt-2 text-[15px] leading-relaxed">
        국가법령정보센터(법제처)에서 판례를 바로 찾아요. 검색은 질문 3번과 따로 세요.
      </p>
      <div className="mt-6 max-w-[820px]">
        <QuestionBox
          value={text}
          onChange={setText}
          onSubmit={() => void submit()}
          busy={state.kind === "loading"}
          size="md"
          label="판례 검색어"
          placeholder="예: 임대차 보증금 반환, 계약금 해제"
        />
        <p className="text-muted mt-2 text-[13px]">
          이름·전화번호 같은 개인정보는 검색어에 넣지 말아 주세요.
        </p>
      </div>

      {state.kind === "error" && (
        <p role="alert" className="text-warn-text mt-6 text-[15px]">
          {searchErrorText(state.error)}
        </p>
      )}
      {state.kind === "loading" && (
        <p aria-live="polite" className="text-muted mt-6 text-[15px]">
          법제처에서 판례를 찾고 있어요…
        </p>
      )}
      {state.kind === "done" && (
        <section aria-label="검색 결과" className="mt-8">
          <SearchNotice notice={state.data.notice} />
          <p className="text-muted mt-3 text-sm leading-relaxed">{state.data.searchScopeNote}</p>
          {state.data.items.length === 0 ? (
            <p className="text-ink mt-6 text-[15px]">
              &lsquo;{state.q}&rsquo;로 찾은 판례가 없어요. 다른 말로 바꿔 검색해 보세요.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {state.data.items.map((c) => (
                <li
                  key={c.id}
                  className="rounded-card border-line flex flex-col gap-1.5 border bg-white p-5"
                >
                  <Link
                    href={`/cases/${c.id}?from=search`}
                    className="font-display text-ink text-base leading-snug font-bold underline-offset-2 hover:underline"
                  >
                    <Highlighted text={c.caseName || c.caseNo} terms={terms} />
                  </Link>
                  {/* 사건 정보 띠: 법원·선고일·사건번호를 한눈에 (글자 크기는 그대로) */}
                  <p className="bg-cream text-label w-fit rounded-[6px] px-2 py-0.5 text-[13px]">
                    {[c.court, dotDate(c.decidedAt), c.caseNo].filter(Boolean).join(" · ")}
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <Link
                      href={`/cases/${c.id}?from=search`}
                      className="text-link inline-flex min-h-11 items-center text-sm underline-offset-2 hover:underline"
                    >
                      판시사항·요지 보기 →
                    </Link>
                    <OriginalLink url={c.sourceUrl} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <SearchCredit />
    </div>
  );
}
