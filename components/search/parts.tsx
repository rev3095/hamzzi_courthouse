"use client";
// 판례·조문 직접 검색 화면 공통 조각. AI가 만든 내용이 없으므로 AI_NOTICE 대신 SEARCH_NOTICE를 쓴다 (절대 규칙 6 취지).
import Link from "next/link";
import type { ClientError } from "@/lib/client/api";
import { SEARCH_NOTICE } from "@/lib/api/respond";
import { highlightParts } from "@/lib/search/highlight";
import { clearRecent, useRecent } from "./recent";

export function SearchNotice({ notice = SEARCH_NOTICE }: { notice?: string }) {
  return (
    <p className="bg-soft text-muted w-fit rounded-[6px] px-2.5 py-1 text-xs font-semibold">
      {notice}
    </p>
  );
}

export function SearchCredit() {
  return (
    <section
      aria-label="출처"
      className="border-line text-muted mt-8 border-t pt-4 text-[13px] leading-relaxed"
    >
      <p>
        출처: 법제처 국가법령정보센터 · &lsquo;원문 보기&rsquo;에서 국가법령정보센터 원문을 확인할
        수 있어요. 판결문 전문은 저장하지 않아요.
      </p>
      <p className="mt-1">
        ⚖ 법제처 자료를 그대로 보여 드려요. 궁금한 점은 햄찌법원 무료 법률 상담으로 물어보세요.
      </p>
    </section>
  );
}

export function OriginalLink({
  url,
  label = "법제처 원문 보기 →",
}: {
  url: string;
  label?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-link inline-flex min-h-11 items-center text-sm underline-offset-2 hover:underline"
    >
      {label}
    </a>
  );
}

/** 검색 화면 오류 문장. 서버 고정 문구·코드만 쓴다 */
export function searchErrorText(err: ClientError): string {
  if (err.code === "EMPTY_INPUT") return "검색어를 적어 주세요.";
  if (err.code === "VALIDATION_ERROR" && err.details?.reason === "personal_info")
    return "이름·전화번호 같은 개인정보로 보이는 검색어는 법제처로 보내지 않아요. 빼고 다시 검색해 주세요.";
  if (err.code === "VALIDATION_ERROR") return "검색어는 100자까지 적을 수 있어요.";
  if (err.code === "RATE_LIMITED")
    return "이 네트워크에서 검색을 많이 했어요. 1시간 안에 할 수 있는 횟수가 정해져 있어요. 잠시 뒤에 다시 해 주세요.";
  if (err.code === "SEARCH_UPSTREAM_FAILED")
    return "법제처에서 결과를 불러오지 못했어요. 결과가 없는 게 아니라 연결 문제예요. 잠시 후 다시 시도해 주세요.";
  if (err.code === "NOT_FOUND") return "법제처에서 찾을 수 없어요. 주소가 맞는지 확인해 주세요.";
  return `일시적인 오류가 발생했어요.${err.requestId ? ` (오류 번호 ${err.requestId})` : ""}`;
}

/**
 * 검색어 낱말 하이라이트. 글자 크기는 그대로 두고 조금 어두운 바탕(honey-line)으로만 표시한다.
 * 새 색 토큰 없이 브랜드 토큰을 쓴다 (docs/05 3.1, docs/07 3절).
 */
export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightParts(text, terms).map((p, i) =>
        p.hit ? (
          <mark
            key={i}
            className="bg-honey-line text-ink rounded-[3px] [box-decoration-break:clone] px-0.5"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** 마지막 검색어 — 이 기기(sessionStorage)에만 둔다. 주소(?q=)·서버 기록에 남기지 않는다 (F-007) */
const SEARCH_KEY = "hz:sq";
export function rememberSearch(q: string) {
  try {
    sessionStorage.setItem(SEARCH_KEY, q);
  } catch {
    // 저장소를 못 쓰면 상세 화면 하이라이트만 빠진다
  }
}
export function recallSearch(): string | null {
  try {
    return sessionStorage.getItem(SEARCH_KEY);
  } catch {
    return null;
  }
}

/** 조회 이력 (DEC-029 제안). 이 기기에만 있고 서버로 보내지 않는다 */
export function RecentList({ compact = false }: { compact?: boolean }) {
  const items = useRecent();
  if (items.length === 0) return null;
  return (
    <section aria-label="최근 본 자료" className={compact ? "" : "mt-8"}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-ink text-lg font-bold">최근 본 자료</h2>
        <button
          type="button"
          onClick={clearRecent}
          className="text-muted min-h-11 px-2 text-[13px] underline-offset-2 hover:underline"
        >
          지우기
        </button>
      </div>
      <p className="text-muted text-[13px]">이 기기에만 저장돼요. 검색어는 저장하지 않아요.</p>
      <ul className={`mt-3 grid gap-2 ${compact ? "" : "lg:grid-cols-2"}`}>
        {items.slice(0, compact ? 8 : 12).map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="rounded-card border-line hover:border-gold flex min-h-11 flex-col justify-center border bg-white px-4 py-2.5"
            >
              <span className="text-ink text-sm font-semibold">{r.title}</span>
              <span className="text-muted text-[12px]">
                {[r.kind, r.sub].filter(Boolean).join(" · ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
