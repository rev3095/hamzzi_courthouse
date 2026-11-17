"use client";
// 법령 도구 /laws/[name] (DEC-029 제안): 3단 비교 · 신구조문 대조 · 개정 연혁 · 별표·서식 · 연계·위임 점검.
// 법제처에 등록된 대조표·관계만 보여 주고, 영향 크기·중요도 같은 판단은 붙이지 않는다 (절대 규칙 2).
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getLawView, type LawVersionView, type LawViews, type OldNewRow } from "@/lib/client/api";
import { statuteIdOf } from "@/lib/search/browse";
import { LAW_VIEWS, type LawView } from "@/lib/search/explore";
import { dotDate } from "../result/labels";
import { H1, H2, Pending, Shell, useLoad } from "./DetailViews";
import { OriginalLink, SearchNotice } from "./parts";

const LABELS: Record<LawView, string> = {
  "three-tier": "3단 비교",
  "old-new": "신구조문 대조",
  history: "개정 연혁",
  annexes: "별표·서식",
  impact: "연계·위임 점검",
};

const LOADING = "법제처에서 불러오고 있어요…";
const chip =
  "border-line text-ink hover:border-gold flex min-h-11 items-center rounded-full border bg-white px-4 text-sm";

const versionLine = (v: LawVersionView | null) =>
  v
    ? [
        v.effectiveFrom && `시행 ${dotDate(v.effectiveFrom)}`,
        v.promulgationNo && `공포번호 제${v.promulgationNo}호`,
        v.revisionType,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

function ArticleLink({ lawName, articleNo }: { lawName: string; articleNo: string }) {
  return (
    <Link
      href={`/statutes/${encodeURIComponent(statuteIdOf(lawName, articleNo))}`}
      className="text-link underline-offset-2 hover:underline"
    >
      {articleNo}
    </Link>
  );
}

function ThreeTier({ d }: { d: LawViews["three-tier"] }) {
  if (d.rows.length === 0)
    return (
      <p className="text-muted mt-4 text-[15px]">
        법제처 3단비교에 이 법령의 위임조문 자료가 없어요. 시행령·시행규칙은 상위 법률 이름으로 찾아
        주세요.
      </p>
    );
  return (
    <ul className="mt-4 grid gap-4">
      {d.rows.map((r) => (
        <li
          key={r.articleNo}
          className="rounded-card border-line grid gap-4 border p-4 lg:grid-cols-2"
        >
          <div>
            <p className="text-muted text-[12px] font-semibold">법률</p>
            <p className="text-ink mt-1 text-sm font-bold">
              <ArticleLink lawName={d.lawName} articleNo={r.articleNo} />
              {r.title && ` (${r.title})`}
            </p>
            <p className="text-ink mt-1 text-sm leading-[1.7] whitespace-pre-line">{r.text}</p>
          </div>
          <div className="grid content-start gap-3">
            {r.delegations.length === 0 && (
              <p className="text-muted text-sm">연결된 하위 조문이 등록되어 있지 않아요.</p>
            )}
            {r.delegations.map((g, i) => (
              <div key={i} className="bg-soft rounded-[8px] p-3">
                <p className="text-muted text-[12px] font-semibold">
                  {g.type} · {g.lawName}
                </p>
                <p className="text-ink mt-1 text-sm font-bold">
                  {g.articleNo && g.type !== "행정규칙" ? (
                    <ArticleLink lawName={g.lawName} articleNo={g.articleNo} />
                  ) : (
                    g.articleNo
                  )}
                  {g.title && ` (${g.title})`}
                </p>
                <p className="text-ink mt-1 text-sm leading-[1.7] whitespace-pre-line">{g.text}</p>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 법제처가 표시한 바뀐 부분(changed)만 바탕색으로 강조한다 */
function Marked({ row }: { row: OldNewRow }) {
  let rest = row.text;
  const out: React.ReactNode[] = [];
  row.changed.forEach((c, i) => {
    const at = rest.indexOf(c);
    if (at < 0) return;
    out.push(rest.slice(0, at));
    out.push(
      <mark key={i} className="bg-cream text-ink rounded-[3px] px-0.5 font-semibold">
        {c}
      </mark>,
    );
    rest = rest.slice(at + c.length);
  });
  out.push(rest);
  return <>{out}</>;
}

function OldNew({ d }: { d: LawViews["old-new"] }) {
  const n = Math.max(d.oldRows.length, d.newRows.length);
  if (n === 0)
    return (
      <p className="text-muted mt-4 text-[15px]">
        법제처에 이 버전의 신구조문 대조표가 없어요. 제정이거나 대조표가 제공되지 않는 개정일 수
        있어요.
      </p>
    );
  const oldBy = new Map(d.oldRows.map((r) => [r.no, r]));
  const newBy = new Map(d.newRows.map((r) => [r.no, r]));
  const nos = [...new Set([...oldBy.keys(), ...newBy.keys()])].sort((a, b) => a - b);
  return (
    <div className="mt-4">
      <p className="text-muted text-[13px]">
        바탕색은 법제처 대조표가 바뀐 곳으로 표시한 부분이에요.
      </p>
      <div className="border-line mt-2 grid grid-cols-2 gap-x-4 border-b pb-2 text-[13px] font-semibold">
        <p className="text-muted">개정 전 · {versionLine(d.old)}</p>
        <p className="text-ink">개정 후 · {versionLine(d.new)}</p>
      </div>
      {nos.map((no) => (
        <div
          key={no}
          className="border-line grid grid-cols-2 gap-x-4 border-b py-2 text-sm leading-[1.7]"
        >
          <p className="text-muted whitespace-pre-line">
            {oldBy.has(no) && <Marked row={oldBy.get(no)!} />}
          </p>
          <p className="text-ink whitespace-pre-line">
            {newBy.has(no) && <Marked row={newBy.get(no)!} />}
          </p>
        </div>
      ))}
    </div>
  );
}

function History({ d, onPick }: { d: LawViews["history"]; onPick: (mst: string) => void }) {
  if (d.versions.length === 0)
    return <p className="text-muted mt-4 text-[15px]">법제처에서 연혁을 찾지 못했어요.</p>;
  return (
    <>
      <p className="text-muted mt-4 text-[13px]">
        시점을 누르면 그 개정의 신구조문 대조표를 보여 드려요. 특정 날짜의 조문은 조문 화면에서
        날짜를 골라 볼 수 있어요.
      </p>
      <ul className="mt-2 grid gap-2">
        {d.versions.map((v) => (
          <li key={`${v.mst}|${v.effectiveFrom}`}>
            <button
              type="button"
              onClick={() => onPick(v.mst)}
              className="rounded-card border-line hover:border-gold flex min-h-11 w-full flex-col justify-center border bg-white px-4 py-2.5 text-left"
            >
              <span className="text-ink text-sm font-semibold">
                {v.effectiveFrom ? `시행 ${dotDate(v.effectiveFrom)}` : "시행일 미상"}
                {v.revisionType && ` · ${v.revisionType}`}
              </span>
              <span className="text-muted text-[12px]">
                {[
                  v.lawName !== d.lawName && v.lawName,
                  v.promulgatedAt && `공포 ${dotDate(v.promulgatedAt)}`,
                  v.promulgationNo && `제${v.promulgationNo}호`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Annexes({ d }: { d: LawViews["annexes"] }) {
  if (d.items.length === 0)
    return (
      <p className="text-muted mt-4 text-[15px]">법제처에 등록된 이 법령의 별표·서식이 없어요.</p>
    );
  return (
    <ul className="mt-4 grid gap-2">
      {d.items.map((a, i) => (
        <li
          key={i}
          className="rounded-card border-line flex flex-wrap items-center justify-between gap-x-4 border bg-white px-4 py-2"
        >
          <p className="text-ink text-sm">
            <span className="text-muted">
              [{a.kind ?? "별표"}
              {a.no && ` ${a.no}`}]
            </span>{" "}
            {a.title}
          </p>
          <span className="flex gap-4">
            {a.pdfUrl && <OriginalLink url={a.pdfUrl} label="PDF →" />}
            {a.fileUrl && <OriginalLink url={a.fileUrl} label="원본 파일 →" />}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Impact({ d }: { d: LawViews["impact"] }) {
  const unlinked = d.checks.filter((c) => c.linked === 0);
  return (
    <div className="mt-4 grid gap-8">
      <p className="text-muted text-[13px] leading-relaxed">{d.impactNote}</p>
      <p className="text-ink text-sm">
        조문 {d.articleCount}개 · 하위법령이 연결된 조문 {d.lower.length}개 · 연계 자치법규 조문{" "}
        {d.ordinances.length}건 · 위임 문구가 있는 조문 {d.checks.length}개
      </p>
      <section>
        <H2>조문 → 하위법령</H2>
        {d.lower.length === 0 ? (
          <p className="text-muted mt-2 text-sm">법제처 3단비교에 등록된 연결이 없어요.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {d.lower.map((r) => (
              <li key={r.articleNo} className="rounded-card border-line border bg-white px-4 py-3">
                <p className="text-ink text-sm font-bold">
                  <ArticleLink lawName={d.lawName} articleNo={r.articleNo} />
                  {r.title && ` (${r.title})`}
                </p>
                <ul className="text-muted mt-1 grid gap-0.5 text-[13px]">
                  {r.delegations.map((g, i) => (
                    <li key={i}>
                      → {g.type} · {g.lawName} {g.articleNo}
                      {g.title && ` (${g.title})`}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <H2>연계된 자치법규</H2>
        {d.ordinances.length === 0 ? (
          <p className="text-muted mt-2 text-sm">법제처 연계정보에 등록된 자치법규가 없어요.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {d.ordinances.map((o, i) => (
              <li key={i}>
                <Link
                  href={`/ordinances/${o.ordinanceId}`}
                  className="rounded-card border-line hover:border-gold flex min-h-11 flex-col justify-center border bg-white px-4 py-2.5"
                >
                  <span className="text-ink text-sm font-semibold">
                    {o.ordinanceName} {o.ordinanceArticleNo}
                  </span>
                  <span className="text-muted text-[12px]">
                    근거: {o.lawName} {o.lawArticleNo}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <H2>위임 문구 점검</H2>
        <p className="text-muted mt-1 text-[13px] leading-relaxed">{d.delegationNote}</p>
        {d.checks.length === 0 ? (
          <p className="text-muted mt-2 text-sm">위임 문구가 있는 조문을 찾지 못했어요.</p>
        ) : (
          <>
            <p className="text-ink mt-2 text-sm">
              위임 문구가 있는 조문 {d.checks.length}개 중 연결 없음 {unlinked.length}개
            </p>
            <ul className="mt-2 grid gap-2">
              {unlinked.map((c) => (
                <li
                  key={c.articleNo}
                  className="rounded-card border-line border bg-white px-4 py-3"
                >
                  <p className="text-ink text-sm font-bold">
                    <ArticleLink lawName={d.lawName} articleNo={c.articleNo} />
                    {c.title && ` (${c.title})`}
                  </p>
                  <p className="text-muted mt-0.5 text-[13px]">
                    조문 문구: “{c.phrase}” · 법제처 3단비교 연결 없음
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function View<K extends LawView>({
  lawName,
  view,
  mst,
  children,
}: {
  lawName: string;
  view: K;
  mst?: string;
  children: (d: LawViews[K]) => React.ReactNode;
}) {
  const r = useLoad(`${lawName}|${view}|${mst ?? ""}`, () => getLawView(lawName, view, mst));
  if (!r?.ok)
    return (
      <div className="mt-4">
        <Pending r={r} loading={LOADING} />
      </div>
    );
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-x-4">
        <SearchNotice notice={r.data.notice} />
        <OriginalLink url={r.data.sourceUrl} />
      </div>
      {children(r.data)}
    </>
  );
}

export function LawRoute() {
  const params = useParams<{ name: string }>();
  const lawName = decodeURIComponent(params.name);
  const query = useSearchParams();
  const router = useRouter();
  const raw = query.get("tab") ?? "three-tier";
  const tab = ((LAW_VIEWS as readonly string[]).includes(raw) ? raw : "three-tier") as LawView;
  const mst = query.get("mst") ?? undefined;
  const go = (next: LawView, nextMst?: string) =>
    router.push(
      `/laws/${encodeURIComponent(lawName)}?tab=${next}${nextMst ? `&mst=${nextMst}` : ""}`,
    );
  return (
    <Shell wide>
      <H1>{lawName}</H1>
      <div
        role="tablist"
        aria-label="법령 도구"
        className="mt-4 flex gap-2 overflow-x-auto pb-1 whitespace-nowrap"
      >
        {LAW_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={tab === v}
            onClick={() => go(v)}
            className={`${chip} ${tab === v ? "border-gold bg-cream font-semibold" : ""}`}
          >
            {LABELS[v]}
          </button>
        ))}
      </div>
      {tab === "three-tier" && (
        <View lawName={lawName} view="three-tier">
          {(d) => <ThreeTier d={d} />}
        </View>
      )}
      {tab === "old-new" && (
        <View lawName={lawName} view="old-new" mst={mst}>
          {(d) => <OldNew d={d} />}
        </View>
      )}
      {tab === "history" && (
        <View lawName={lawName} view="history">
          {(d) => <History d={d} onPick={(m) => go("old-new", m)} />}
        </View>
      )}
      {tab === "annexes" && (
        <View lawName={lawName} view="annexes">
          {(d) => <Annexes d={d} />}
        </View>
      )}
      {tab === "impact" && (
        <View lawName={lawName} view="impact">
          {(d) => <Impact d={d} />}
        </View>
      )}
      <p className="text-muted mt-6 text-[13px] leading-relaxed">
        법령 이름이 정확하지 않으면 찾지 못할 수 있어요. 조문 화면의 &lsquo;더 살펴보기&rsquo;에서
        들어오면 정식 이름으로 열려요.
      </p>
    </Shell>
  );
}
