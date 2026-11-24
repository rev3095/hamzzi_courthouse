"use client";
// 홈 질문 영역 (S-01): 질문창 → 가이드 토글(카테고리 버튼 DEC-028 · 예시 답변 피드를 한 상자에, 2026-11-24). 하루 횟수를 다 쓰면 누를 때 데모 한도 안내 (S-06 자리).
// 카테고리를 고르면 질문창 위에 안내·문장 시작·그 분야 예시 답변이 나온다. 보내기는 지금처럼 질문 1번으로 센다(DEC-024).
// 카테고리는 이 기기에만 질문과 함께 남겨 결과 화면 분류·무료 판례 검색을 돕는다 (lib/procedure/categories).
// 예시 답변(/examples/[id])에서 "내 상황으로 질문하기"로 오면 주소의 ?category=로 그 분야가 골라져 있다.
// 예시 질문은 저장된 분석 재생이라 횟수와 상관없이 언제든 볼 수 있다 (DEC-027). 서버도 같은 기준(lib/demo findExample)으로 판단한다.
// 가이드 아래에는 분야별 비서 묶음(F-018, DEC-057)을 둔다 — 누르면 비서 페이지로 간다.
// 질문창에 서류 사진을 붙이면 "물어보기"가 서류 분석 창(F-015, DEC-052)을 연다 — 동의 → 읽기 → 확인 뒤 질문 1번으로 분석한다.
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { isQuotaBlocked, isSignedIn } from "@/lib/client/api";
import { ANON_QUESTION_LIMIT, USER_QUESTION_LIMIT } from "@/lib/inquiries/policy";
import { CATEGORIES, isCategoryKey, type CategoryKey } from "@/lib/procedure/categories";
import { AssistantCards } from "../assistants/AssistantCards";
import { DeepAsk } from "../ask/DeepAsk";
import { limitCopy } from "../LimitNotice";
import { QuestionBox } from "../ask/QuestionBox";
import { useAsk } from "../ask/useAsk";
import { useCaseFileAsk } from "../casefile/useCaseFileAsk";
import { useQuota } from "../useQuota";
import { HomeGuide, type GuideExample } from "./HomeGuide";

const noSubscribe = () => () => {};

/** 주소의 ?category= (정해진 값만). useSearchParams 대신 써서 홈 전체를 Suspense로 감싸지 않는다 */
function urlCategory(): CategoryKey | null {
  const v = new URLSearchParams(window.location.search).get("category");
  return isCategoryKey(v) ? v : null;
}

export function HomeAsk({ examples }: { examples: GuideExample[] }) {
  const [text, setText] = useState("");
  const [deepOpen, setDeepOpen] = useState(false);
  // undefined = 아직 고르지 않음(주소 값을 따른다), null = 고른 것을 해제
  const [picked, setPicked] = useState<CategoryKey | null | undefined>(undefined);
  const fromUrl = useSyncExternalStore(noSubscribe, urlCategory, () => null);
  const category = picked === undefined ? fromUrl : picked;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const quota = useQuota();
  const { busy, error, send, modals, showLimit } = useAsk({ category });
  const blocked = isQuotaBlocked(quota);
  const signedIn = isSignedIn(quota);
  const current = category ? CATEGORIES[category] : null;
  const categoryExamples = current ? examples.filter((e) => current.examples.includes(e.id)) : [];

  // 서버 findExample과 같은 비교 (NFKC, 공백 하나로)
  const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
  const isExample = (q: string) => examples.some((e) => norm(e.question) === norm(q));

  const caseFile = useCaseFileAsk({ send, busy, error, blocked, showLimit });
  const submit = (q: string) => {
    // 서류 사진이 붙어 있으면 서류 분석 창으로 간다 (글은 비워도 된다)
    if (caseFile.start(q)) return;
    if (blocked && !isExample(q)) showLimit();
    else void send(q);
  };
  const focusBox = () => {
    const el = inputRef.current;
    if (!el) return;
    el.scrollIntoView?.({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  };

  return (
    <>
      <div id="ask" className="w-full max-w-[820px] scroll-mt-24 text-left">
        {current && (
          <div className="rounded-card border-line mb-3 border bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-cream text-label rounded-[6px] px-2 py-0.5 text-xs font-semibold">
                {current.label}
              </span>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="text-muted min-h-11 px-1 text-[13px] underline-offset-2 hover:underline"
              >
                분야 선택 해제
              </button>
            </div>
            <p className="text-ink mt-1 text-sm leading-relaxed">{current.guide}</p>
            <div className="mt-2 flex flex-wrap gap-2" aria-label="문장 시작">
              {current.starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setText((t) => (t.trim() ? `${t.trimEnd()} ${s}` : s));
                    focusBox();
                  }}
                  className="border-line text-ink hover:border-gold min-h-11 rounded-full border bg-white px-3.5 text-left text-[13px]"
                >
                  {s.trim()}
                </button>
              ))}
            </div>
            {categoryExamples.length > 0 && (
              <p className="text-muted mt-2 text-[13px]">
                먼저 보기:{" "}
                {categoryExamples.map((e, i) => (
                  <span key={e.id}>
                    {i > 0 && " · "}
                    <Link href={e.href} className="text-link underline-offset-2 hover:underline">
                      예시 답변 {i + 1}
                    </Link>
                  </span>
                ))}{" "}
                (질문 횟수에 포함되지 않아요)
              </p>
            )}
          </div>
        )}
        <QuestionBox
          value={text}
          onChange={setText}
          onSubmit={() => submit(text)}
          busy={busy}
          placeholder={
            caseFile.attach.items.length > 0
              ? "서류에 대해 궁금한 점을 적어 주세요 (비워도 돼요)"
              : current?.placeholder
          }
          inputRef={inputRef}
          askTools
          attach={caseFile.attach}
          onDeep={() => (blocked ? showLimit() : setDeepOpen(true))}
        />
        {deepOpen && (
          <DeepAsk
            initialText={text}
            busy={busy}
            onClose={() => setDeepOpen(false)}
            onSubmit={(q) => {
              setDeepOpen(false);
              void send(q, false, true);
            }}
          />
        )}
        {caseFile.flow}
        {error ? (
          <p role="alert" className="text-warn-text mt-3 text-center text-sm">
            {error}
          </p>
        ) : (
          <p className="text-muted mt-3 text-center text-[13px] leading-relaxed">
            {blocked
              ? limitCopy(signedIn).body
              : `이름·전화번호 같은 개인정보는 빼고 적어 주세요. ${signedIn ? "오늘은" : "데모에서는"} 하루 ${signedIn ? USER_QUESTION_LIMIT : ANON_QUESTION_LIMIT}번까지 물어볼 수 있어요. 아래 가이드의 예시 답변은 횟수에 들어가지 않아요.`}
          </p>
        )}
        <p className="mt-1 text-center text-[13px]">
          <Link href="/casefile" className="text-link underline-offset-2 hover:underline">
            내용증명·소장 같은 서류 사진으로 분석하기 →
          </Link>
        </p>
      </div>
      <div className="mt-6 flex w-full justify-center">
        <HomeGuide
          examples={examples}
          selected={category}
          onPick={(key) => {
            setPicked(key);
            focusBox();
          }}
        />
      </div>
      {/* 분야별 비서 묶음 (F-018, DEC-057): 가이드 토글 아래 */}
      <section aria-labelledby="home-assistants" className="mt-8 w-full max-w-[820px] text-left">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="home-assistants" className="font-display text-ink text-[22px] font-bold">
            전문 에이전트
          </h2>
          <Link
            href="/assistants"
            className="text-link text-[13px] underline-offset-2 hover:underline"
          >
            전문 에이전트 소개 →
          </Link>
        </div>
        <p className="text-muted mt-1 text-[14px]">
          자주 묻는 분야는 전문 에이전트에게 대화하듯 물어보세요. 분석이 끝난 질문마다 1회로 세요(예시 질문
          제외).
        </p>
        <div className="mt-4">
          <AssistantCards compact />
        </div>
      </section>
      {modals}
    </>
  );
}
