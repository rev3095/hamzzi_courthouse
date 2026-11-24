"use client";
// 결과 화면의 "서류에 적힌 당사자" (F-015 AC4, DEC-052). 서류 분석으로 만든 질문에만 보인다.
// 목록은 이 탭(sessionStorage)에만 있다 — 서버에 저장하지 않는다. 개인은 이름이 없고, 법인·사업자만 공개 정보를 찾아볼 수 있다.
// 찾은 결과는 공식 API의 검색 결과일 뿐이고 같은 곳인지는 판단하지 않는다. 평판·위험도 같은 판정도 없다 (절대 규칙 2).
import { useState, useSyncExternalStore } from "react";
import type { CaseParty } from "@/lib/casefile/limits";
import {
  lookupBusiness,
  parseParties,
  recallPartiesRaw,
  type BusinessLookup,
} from "@/lib/client/casefile";
import { PartyList } from "../casefile/CaseFileFlow";

const noSubscribe = () => () => {};

type Lookup =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "done"; data: BusinessLookup };

export function PartiesCard({ inquiryId }: { inquiryId: string }) {
  const raw = useSyncExternalStore(
    noSubscribe,
    () => recallPartiesRaw(inquiryId),
    () => null,
  );
  const parties = parseParties(raw);
  if (parties.length === 0) return null;
  return (
    <section
      className="rounded-card border-line mt-7 border px-5 py-4"
      data-testid="parties-card"
      aria-label="서류에 적힌 당사자"
    >
      <PartyList
        parties={parties}
        action={(p) => (p.kind === "business" && p.name ? <BusinessLookupBox party={p} /> : null)}
      />
      <p className="text-muted mt-1 text-[12px]">
        이 목록은 이 기기에만 잠깐 보관하고 서버에 저장하지 않아요.
      </p>
    </section>
  );
}

function BusinessLookupBox({ party }: { party: CaseParty }) {
  const [state, setState] = useState<Lookup>({ kind: "idle" });

  async function find() {
    setState({ kind: "loading" });
    const r = await lookupBusiness(party.name);
    setState(r.ok ? { kind: "done", data: r.data } : { kind: "error" });
  }

  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <button
        type="button"
        onClick={() => void find()}
        disabled={state.kind === "loading"}
        className="border-line text-ink hover:border-gold mt-1.5 flex min-h-11 items-center rounded-full border bg-white px-3.5 text-[13px] disabled:opacity-60"
      >
        {state.kind === "loading" ? "찾는 중…" : "공개 정보 찾아보기"}
      </button>
    );
  }
  if (state.kind === "error") {
    return (
      <p role="alert" className="text-warn-text mt-1.5 text-[13px]">
        지금은 찾아보지 못했어요. 잠시 뒤에 다시 해 주세요.
      </p>
    );
  }

  const { places, corps, links, notice } = state.data;
  const nothing = places.items.length === 0 && corps.items.length === 0;
  return (
    <div className="bg-soft mt-2 rounded-[8px] px-3 py-2.5 text-[13px]">
      <p className="text-label text-[12px] font-semibold">{notice}</p>
      {corps.items.length > 0 && (
        <>
          <p className="text-ink mt-2 font-semibold">기업 기본 정보 (금융위원회 공공데이터)</p>
          <ul className="mt-1 space-y-1.5">
            {corps.items.map((c, i) => (
              <li key={`${c.corpName}-${i}`} className="text-ink leading-relaxed">
                {c.corpName}
                <span className="text-muted">
                  {[c.industry, c.address, c.establishedAt && `설립 ${c.establishedAt}`]
                    .filter(Boolean)
                    .map((v) => ` · ${v}`)
                    .join("")}
                </span>
                {c.homepage && (
                  <>
                    {" "}
                    <ExternalLink url={c.homepage} label="홈페이지" />
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {places.items.length > 0 && (
        <>
          <p className="text-ink mt-2 font-semibold">장소 검색 결과 (네이버 지역 검색)</p>
          <ul className="mt-1 space-y-1.5">
            {places.items.map((p, i) => (
              <li key={`${p.title}-${i}`} className="text-ink leading-relaxed">
                {p.title}
                <span className="text-muted">
                  {[p.category, p.roadAddress ?? p.address]
                    .filter(Boolean)
                    .map((v) => ` · ${v}`)
                    .join("")}
                </span>
                {p.link && (
                  <>
                    {" "}
                    <ExternalLink url={p.link} label="링크" />
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {nothing && (
        <p className="text-muted mt-2 leading-relaxed">
          자동으로 찾은 결과가 없어요. 아래 사이트에서 직접 확인해 보세요.
        </p>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-4">
        {links.map((l) => (
          <li key={l.url}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link inline-flex min-h-11 items-center underline-offset-2 hover:underline"
            >
              {l.label} →
            </a>
          </li>
        ))}
      </ul>
      <p className="text-muted leading-relaxed">
        이름이 같은 다른 곳일 수 있어요. 주소와 업종이 서류와 맞는지 직접 확인해 주세요.
      </p>
    </div>
  );
}

function ExternalLink({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-link underline-offset-2 hover:underline"
    >
      {label}
    </a>
  );
}
