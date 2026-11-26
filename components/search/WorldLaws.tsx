"use client";
// 법령 탭: 국내·해외 법령 통합 검색 결과와 처음 화면 (DEC-074). 모델을 쓰지 않는다 — 각국 공식 사이트 검색 결과와
// 직접 고른 핵심 법령 목록(lib/search/world/catalog.ts)만 보인다. 관련도·유불리 표시는 없다 (절대 규칙 2).
// 읽기 쉬움이 먼저다: 큰 누름 영역(min-h-11), 짧은 말, 국기 옆에는 언제나 나라 이름을 글로 적는다.
import Link from "next/link";
import { useState } from "react";
import type { WorldLawList } from "@/lib/client/api";
import { catalogByCountry } from "@/lib/search/world/catalog";
import {
  COUNTRIES,
  COUNTRY_CODES,
  regionOf,
  WORLD_NOTICE,
  type CountryCode,
  type WorldLawHit,
} from "@/lib/search/world/types";
import { dotDate } from "../result/labels";
import { CountryLabel, Flag } from "./Flag";
import { Highlighted, SearchNotice } from "./parts";
import { usePins } from "./recent";
import { isPinned, togglePin, type Row } from "./rows";

/** 법령 탭 처음 화면의 예시 검색어. 누르면 바로 찾는다 */
export const WORLD_EXAMPLES = ["의료기기 허가", "의료기기 리콜", "체외진단", "품질관리"] as const;

type Filter = "all" | "domestic" | "foreign" | CountryCode;

const rowOf = (h: WorldLawHit): Row | null =>
  h.internal
    ? {
        kind: "laws",
        id: h.id,
        href: h.internal,
        title: h.title,
        org: null,
        date: h.date ?? null,
        refNo: h.kind,
        sourceUrl: h.sourceUrl,
      }
    : null;

const ACTION =
  "inline-flex min-h-11 items-center text-[15px] font-semibold underline-offset-2 hover:underline";

function WorldCard({ hit, terms = [] }: { hit: WorldLawHit; terms?: string[] }) {
  const pins = usePins();
  const row = rowOf(hit);
  const main = hit.titleKo ?? hit.title;
  const facts = [hit.kind, hit.citation, dotDate(hit.date)].filter(Boolean).join(" · ");
  return (
    <li
      data-country={hit.country}
      className="rounded-card border-line flex flex-col gap-2 border bg-white p-5"
    >
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
        <CountryLabel
          country={hit.country}
          className="bg-cream text-ink rounded-full px-2.5 py-1 font-semibold"
        />
        {hit.curated && (
          <span className="border-gold text-ink rounded-full border px-2.5 py-0.5 font-semibold">
            핵심 법령
          </span>
        )}
      </p>
      {hit.internal ? (
        <Link
          href={hit.internal}
          className="font-display text-ink text-[19px] leading-snug font-bold underline-offset-2 hover:underline"
        >
          <Highlighted text={main} terms={terms} />
        </Link>
      ) : (
        <p className="font-display text-ink text-[19px] leading-snug font-bold">
          <Highlighted text={main} terms={terms} />
        </p>
      )}
      {hit.titleKo && (
        <p
          lang={hit.country === "jp" ? "ja" : hit.country === "cn" ? "zh" : "en"}
          className="text-muted text-sm leading-snug"
        >
          {hit.title}
        </p>
      )}
      {facts && <p className="text-muted text-[13px]">{facts}</p>}
      {hit.snippet && <p className="text-ink text-[15px] leading-relaxed">{hit.snippet}</p>}
      <p className="text-muted text-[12px]">출처 · {hit.source}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {hit.internal && (
          <Link href={hit.internal} className={`${ACTION} text-link`}>
            쉬운 설명 보기 →
          </Link>
        )}
        <a
          href={hit.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${ACTION} text-link`}
        >
          공식 원문 보기 ↗
        </a>
        {row && (
          <button
            type="button"
            aria-pressed={isPinned(pins, row)}
            onClick={() => togglePin(pins, row)}
            className={`rounded-button inline-flex min-h-11 items-center border px-3 text-sm font-semibold ${
              isPinned(pins, row)
                ? "border-gold bg-honey text-ink"
                : "border-line text-ink bg-white"
            }`}
          >
            {isPinned(pins, row) ? "보관함에서 빼기" : "보관함에 담기"}
          </button>
        )}
      </div>
    </li>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold ${
        active ? "border-gold bg-honey text-ink" : "border-line text-ink hover:border-gold bg-white"
      }`}
    >
      {children}
    </button>
  );
}

function ExampleChips({ onPick }: { onPick: (q: string) => void }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {WORLD_EXAMPLES.map((q) => (
        <li key={q}>
          <button
            type="button"
            onClick={() => onPick(q)}
            className="border-line text-ink hover:border-gold flex min-h-11 items-center rounded-full border bg-white px-4 text-[15px]"
          >
            {q}
          </button>
        </li>
      ))}
    </ul>
  );
}

const names = (list: CountryCode[]) => list.map((c) => COUNTRIES[c].name).join("·");

export function WorldResults({
  q,
  data,
  terms,
  onPick,
}: {
  q: string;
  data: WorldLawList;
  terms: string[];
  onPick: (q: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const { items } = data;
  const count = (f: Filter) =>
    f === "all"
      ? items.length
      : f === "domestic" || f === "foreign"
        ? items.filter((h) => regionOf(h.country) === f).length
        : items.filter((h) => h.country === f).length;
  const present = COUNTRY_CODES.filter((c) => items.some((h) => h.country === c));
  const shown = items.filter((h) =>
    filter === "all"
      ? true
      : filter === "domestic" || filter === "foreign"
        ? regionOf(h.country) === filter
        : h.country === filter,
  );
  const sent = [data.translated.en, data.translated.ja].filter(Boolean);

  return (
    <section aria-label="검색 결과" className="mt-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-ink text-xl font-bold">&lsquo;{q}&rsquo; 검색 결과</h2>
        <span data-testid="result-count" className="text-gold text-base font-bold">
          {items.length}건
        </span>
      </div>
      <div className="mt-2">
        <SearchNotice notice={data.notice || WORLD_NOTICE} />
      </div>
      {sent.length > 0 && (
        <p data-testid="world-translated" className="text-muted mt-3 text-sm leading-relaxed">
          해외 자료는 이렇게 찾았어요: {sent.join(" · ")}
        </p>
      )}
      {data.failed.length > 0 && (
        <p role="status" className="text-muted mt-2 text-sm leading-relaxed">
          {names(data.failed)} 자료는 지금 불러오지 못했어요. 잠시 뒤에 다시 찾아 주세요.
        </p>
      )}

      {items.length === 0 ? (
        <div className="mt-6">
          <p className="text-ink text-[15px]">
            &lsquo;{q}&rsquo;로 찾은 법령이 없어요. 다른 말로 바꿔 검색해 보세요.
          </p>
          <div className="mt-4">
            <ExampleChips onPick={onPick} />
          </div>
        </div>
      ) : (
        <>
          <div role="group" aria-label="나라 고르기" className="mt-5 flex flex-wrap gap-2">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              전체 <span className="text-muted font-normal">{count("all")}</span>
            </Chip>
            <Chip active={filter === "domestic"} onClick={() => setFilter("domestic")}>
              국내 <span className="text-muted font-normal">{count("domestic")}</span>
            </Chip>
            <Chip active={filter === "foreign"} onClick={() => setFilter("foreign")}>
              해외 <span className="text-muted font-normal">{count("foreign")}</span>
            </Chip>
            {present.length > 1 &&
              present.map((c) => (
                <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>
                  <Flag country={c} />
                  {COUNTRIES[c].name} <span className="text-muted font-normal">{count(c)}</span>
                </Chip>
              ))}
          </div>
          {shown.length === 0 ? (
            <p className="text-ink mt-6 text-[15px]">이 묶음에는 찾은 법령이 없어요.</p>
          ) : (
            <ul data-testid="world-list" className="mt-4 grid gap-3 lg:grid-cols-2">
              {shown.map((h) => (
                <WorldCard key={h.id} hit={h} terms={terms} />
              ))}
            </ul>
          )}
        </>
      )}
      <p className="text-muted mt-5 text-[13px] leading-relaxed">
        해외 법령은 각 나라 공식 사이트의 원문 그대로예요. 번역하지 않았어요. 한국어 이름과 설명은
        핵심 법령에만 직접 적어 두었어요. 결과가 없다고 그 나라에 법령이 없다는 뜻은 아니에요.
      </p>
    </section>
  );
}

/** 검색 전 처음 화면: 직접 고른 의료기기 핵심 법령을 국내 / 해외(나라별)로 보인다 */
export function WorldStarter({ onPick }: { onPick: (q: string) => void }) {
  const groups = catalogByCountry();
  const domestic = groups.filter((g) => regionOf(g.country) === "domestic");
  const foreign = groups.filter((g) => regionOf(g.country) === "foreign");
  return (
    <section aria-label="의료기기 법령 한눈에" className="mt-8">
      <h2 className="font-display text-ink text-xl font-bold">의료기기 법령 한눈에</h2>
      <p className="text-muted mt-1 text-[15px] leading-relaxed">
        자주 보는 핵심 법령을 나라별로 모아 두었어요. 낱말로 찾으면 국내와 해외 공식 사이트를 함께
        찾아요.
      </p>
      <div className="mt-2">
        <SearchNotice notice={WORLD_NOTICE} />
      </div>
      <div className="mt-4">
        <p className="text-muted mb-2 text-[13px] font-semibold">이런 말로 찾아보세요</p>
        <ExampleChips onPick={onPick} />
      </div>
      {[
        { label: "국내", list: domestic },
        { label: "해외", list: foreign },
      ].map(({ label, list }) => (
        <div key={label} className="mt-8">
          <h3 className="font-display text-ink text-lg font-bold">{label}</h3>
          {list.map((g) => (
            <section key={g.country} aria-label={`${g.name} 핵심 법령`} className="mt-4">
              <h4 className="text-ink flex items-center gap-2 text-base font-bold">
                <Flag country={g.country} />
                {g.name}
                <span className="text-muted text-sm font-normal">{g.items.length}</span>
              </h4>
              <ul className="mt-3 grid gap-3 lg:grid-cols-2">
                {g.items.map((h) => (
                  <WorldCard key={h.id} hit={h} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ))}
    </section>
  );
}
