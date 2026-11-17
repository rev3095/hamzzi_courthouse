"use client";
// 자치법규 /ordinances/[id] · 나란히 보기 /ordinances/compare?a=&b= (DEC-026 제안).
// 두 지자체의 조문을 그대로 나란히 놓을 뿐, 어느 쪽이 낫다는 평가나 요약을 만들지 않는다.
import { useParams, useSearchParams } from "next/navigation";
import { getOrdinance, type OrdinanceView } from "@/lib/client/api";
import { dotDate } from "../result/labels";
import { BODY, H1, H2, Pending, Shell, useLoad } from "./DetailViews";
import { OriginalLink, SearchNotice } from "./parts";
import { useRecordRecent } from "./recent";

const meta = (o: OrdinanceView) =>
  [o.region, o.effectiveFrom && `시행 ${dotDate(o.effectiveFrom)}`].filter(Boolean).join(" · ");

function Articles({ o }: { o: OrdinanceView }) {
  if (o.articles.length === 0)
    return (
      <p className="text-muted mt-4 text-sm">
        법제처가 조문 단위 본문을 제공하지 않아요. 원문에서 확인해 주세요.
      </p>
    );
  return (
    <div className="mt-2">
      {o.articles.map((a, i) => (
        <p key={i} className={BODY}>
          {a.text}
        </p>
      ))}
    </div>
  );
}

export function OrdinanceRoute() {
  const { id } = useParams<{ id: string }>();
  const r = useLoad(id, () => getOrdinance(id));
  const o = r?.ok ? r.data : null;
  useRecordRecent(
    o && { href: `/ordinances/${o.id}`, title: o.name, sub: o.region ?? "", kind: "자치법규" },
  );
  if (!o)
    return (
      <Shell>
        <Pending r={r} loading="법제처에서 자치법규를 불러오고 있어요…" />
      </Shell>
    );
  return (
    <Shell>
      <SearchNotice notice={o.notice} />
      <H1>{o.name}</H1>
      <p className="text-muted mt-1 text-sm">{meta(o)}</p>
      <Articles o={o} />
      <div className="mt-4">
        <OriginalLink url={o.sourceUrl} />
      </div>
    </Shell>
  );
}

function Column({ id }: { id: string }) {
  const r = useLoad(id, () => getOrdinance(id));
  if (!r?.ok)
    return (
      <div>
        <Pending r={r} loading="법제처에서 불러오고 있어요…" />
      </div>
    );
  const o = r.data;
  return (
    <div className="min-w-0">
      <H2>{o.name}</H2>
      <p className="text-muted mt-1 text-[13px]">
        {meta(o)} · 조문 {o.articles.length}개
      </p>
      <Articles o={o} />
      <div className="mt-2">
        <OriginalLink url={o.sourceUrl} />
      </div>
    </div>
  );
}

export function OrdinanceCompareRoute() {
  const q = useSearchParams();
  const ids = [q.get("a") ?? "", q.get("b") ?? ""];
  const valid = ids.every((x) => /^\d{1,16}$/.test(x)) && ids[0] !== ids[1];
  return (
    <Shell wide>
      <SearchNotice />
      <H1>자치법규 나란히 보기</H1>
      <p className="text-muted mt-1 text-sm leading-relaxed">
        두 지자체의 조문을 법제처 원문 그대로 나란히 놓았어요. 어느 쪽이 더 낫다는 평가는 하지
        않아요.
      </p>
      {valid ? (
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <Column id={ids[0]} />
          <Column id={ids[1]} />
        </div>
      ) : (
        <p role="alert" className="text-warn-text mt-6">
          검색 화면의 자치법규 탭에서 비교할 두 건을 골라 주세요.
        </p>
      )}
    </Shell>
  );
}
