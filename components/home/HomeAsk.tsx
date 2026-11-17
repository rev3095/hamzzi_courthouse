"use client";
// 홈 질문 영역 (S-01): 질문창 → 카테고리 버튼(DEC-026) → 예시 답변 피드. 3회를 다 쓰면 누를 때 데모 한도 안내 (S-06 자리).
// 카테고리를 고르면 질문창 위에 안내·문장 시작·그 분야 예시 답변이 나온다. 보내기는 지금처럼 질문 1번으로 센다(DEC-024).
// 카테고리는 이 기기에만 질문과 함께 남겨 결과 화면 분류·무료 판례 검색을 돕는다 (lib/procedure/categories).
// 예시 답변(/examples/[id])에서 "내 상황으로 질문하기"로 오면 주소의 ?category=로 그 분야가 골라져 있다.
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { CATEGORIES, isCategoryKey, type CategoryKey } from "@/lib/procedure/categories";
import { DEMO_LIMIT_TEXT } from "../LimitNotice";
import { ExampleFeed, type FeedExample } from "../ask/ExampleFeed";
import { QuestionBox } from "../ask/QuestionBox";
import { useAsk } from "../ask/useAsk";
import { useQuota } from "../useQuota";
import { CategoryPicker } from "./CategoryPicker";

const noSubscribe = () => () => {};

/** 주소의 ?category= (정해진 값만). useSearchParams 대신 써서 홈 전체를 Suspense로 감싸지 않는다 */
function urlCategory(): CategoryKey | null {
  const v = new URLSearchParams(window.location.search).get("category");
  return isCategoryKey(v) ? v : null;
}

export function HomeAsk({ examples }: { examples: FeedExample[] }) {
  const [text, setText] = useState("");
  // undefined = 아직 고르지 않음(주소 값을 따른다), null = 고른 것을 해제
  const [picked, setPicked] = useState<CategoryKey | null | undefined>(undefined);
  const fromUrl = useSyncExternalStore(noSubscribe, urlCategory, () => null);
  const category = picked === undefined ? fromUrl : picked;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const quota = useQuota();
  const { busy, error, send, modals, showLimit } = useAsk({ category });
  const blocked = quota?.loginRequired === true;
  const current = category ? CATEGORIES[category] : null;
  const categoryExamples = current ? examples.filter((e) => current.examples.includes(e.id)) : [];

  const submit = (q: string) => (blocked ? showLimit() : void send(q));
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
          placeholder={current?.placeholder}
          inputRef={inputRef}
        />
        {error ? (
          <p role="alert" className="text-warn-text mt-3 text-center text-sm">
            {error}
          </p>
        ) : (
          <p className="text-muted mt-3 text-center text-[13px] leading-relaxed">
            {blocked
              ? DEMO_LIMIT_TEXT
              : "이름·전화번호 같은 개인정보는 빼고 적어 주세요. 데모에서는 하루 3번까지 물어볼 수 있어요."}
          </p>
        )}
      </div>
      <div className="mt-10 w-full max-w-[1120px]">
        <CategoryPicker
          selected={category}
          onPick={(key) => {
            setPicked(key);
            focusBox();
          }}
        />
      </div>
      <div className="mt-12 w-full max-w-[1120px]">
        <ExampleFeed examples={examples} />
      </div>
      {modals}
    </>
  );
}
