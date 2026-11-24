// 서류 분석 예시 화면의 앞부분 (F-015, DEC-052): 서류 그림 · 읽은 내용 · 당사자 관계도 · 질문.
// 실제 서류 분석 창(CaseFileFlow)이 보여 주는 것과 같은 정보를 정적으로 보인다 — 모델·DB 호출 없음.
// 당사자는 서류에 적힌 역할과 자리(요구하는 쪽 / 받는 쪽)로만 나누고, 개인은 이름 없이 역할만 보인다 (절대 규칙 2·4).
import Image from "next/image";
import { AiNotice } from "@/components/result/parts";
import type { CaseFileExample } from "@/lib/casefile/examples";
import { BASIS_LABEL } from "@/lib/casefile/examples";
import {
  KIND_LABEL,
  MY_SIDE_LABEL,
  PARTY_SIDES,
  SIDE_LABEL,
  type CaseParty,
  type PartySide,
} from "@/lib/casefile/limits";

const FLOW = [
  { n: 1, title: "서류 사진", body: "받은 서류를 사진으로 붙였어요" },
  { n: 2, title: "읽은 내용 확인", body: "개인정보를 가린 사건 개요" },
  { n: 3, title: "쟁점별 근거", body: "법제처 법령·판례로 정리" },
] as const;

const SIDE_TONE: Record<PartySide, string> = {
  claimant: "border-gold-line bg-cream",
  respondent: "border-line bg-soft",
  other: "border-line bg-white",
};

function partyLabel(p: CaseParty) {
  return p.kind === "person" ? `${p.role} (개인)` : `${p.role} · ${p.name || KIND_LABEL[p.kind]}`;
}

/** 요구하는 쪽 → 받는 쪽 관계도. 그 밖(기관·제3자)은 아래 줄에 둔다 */
function PartyMap({ parties }: { parties: CaseParty[] }) {
  const by = (s: PartySide) => parties.filter((p) => p.side === s);
  const box = (s: PartySide) => (
    <div className={`rounded-card min-w-0 flex-1 border px-3 py-2.5 ${SIDE_TONE[s]}`}>
      <p className="text-label text-[12px] font-semibold">{SIDE_LABEL[s]}</p>
      <ul className="mt-1 space-y-0.5">
        {by(s).length === 0 ? (
          <li className="text-muted text-[13px]">서류에 적혀 있지 않아요</li>
        ) : (
          by(s).map((p, i) => (
            <li key={i} className="text-ink text-[14px] leading-snug break-keep">
              {partyLabel(p)}
            </li>
          ))
        )}
      </ul>
    </div>
  );
  return (
    <div aria-label="당사자 관계도">
      <div className="flex items-stretch gap-2">
        {box(PARTY_SIDES[0])}
        <div className="text-muted flex flex-col items-center justify-center px-1 text-[11px]">
          <span aria-hidden className="text-ink text-xl leading-none">
            →
          </span>
          요구·청구
        </div>
        {box(PARTY_SIDES[1])}
      </div>
      {by("other").length > 0 && <div className="mt-2">{box("other")}</div>}
    </div>
  );
}

export function CaseFileExampleView({ example }: { example: CaseFileExample }) {
  const { reading } = example;
  return (
    <section aria-label="서류와 읽은 내용" className="mb-6">
      <ol className="mb-4 grid grid-cols-3 gap-2">
        {FLOW.map((s) => (
          <li key={s.n} className="rounded-card border-line flex gap-2 border bg-white px-3 py-2.5">
            <span className="bg-ink flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white">
              {s.n}
            </span>
            <span className="min-w-0">
              <span className="text-ink block text-[14px] font-semibold">{s.title}</span>
              <span className="text-muted hidden text-[12px] sm:block">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <figure className="rounded-card border-line overflow-hidden border bg-white">
          <div className="max-h-[560px] overflow-y-auto">
            <Image
              src={example.image}
              alt={`${example.title} — 직접 쓴 가상 서류 그림`}
              width={example.width}
              height={example.height}
              loading="eager"
              className="h-auto w-full"
            />
          </div>
          <figcaption className="border-line text-muted border-t px-4 py-2 text-[12px]">
            {BASIS_LABEL[example.basis]} · 직접 쓴 가상 서류예요. 실제 인물·회사·사건과 관계없어요.
          </figcaption>
        </figure>

        <div className="space-y-3">
          {/* 읽은 내용·요구·당사자는 AI 판독 결과다 (절대 규칙 6, F-015 AC2) */}
          <AiNotice />
          <div className="rounded-card border-line border bg-white px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-ink mr-1 text-[15px] font-semibold">읽은 내용</h2>
              {reading.docTypes.map((t) => (
                <span key={t} className="bg-soft text-ink rounded-full px-2 py-0.5 text-[12px]">
                  {t}
                </span>
              ))}
            </div>
            <details className="group mt-2">
              <summary className="text-muted cursor-pointer text-[14px] leading-relaxed">
                <span className="line-clamp-3 group-open:line-clamp-none">{reading.summary}</span>
                <span className="text-link mt-1 block text-[13px] group-open:hidden">
                  사건 개요 펼치기
                </span>
              </summary>
            </details>
          </div>

          {reading.claims.length > 0 && (
            <div className="rounded-card border-line border bg-white px-4 py-3.5">
              <h2 className="text-ink text-[15px] font-semibold">서류의 요구·주장</h2>
              <ol className="mt-2 space-y-1.5">
                {reading.claims.map((c, i) => (
                  <li key={i} className="flex gap-2 text-[14px] leading-relaxed">
                    <span className="bg-honey text-ink flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
                      {i + 1}
                    </span>
                    <span className="text-ink">{c}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="rounded-card border-line border bg-white px-4 py-3.5">
            <h2 className="text-ink mb-2 text-[15px] font-semibold">당사자 관계</h2>
            <PartyMap parties={reading.parties} />
            <p className="text-muted mt-2 text-[12px]">
              AI가 서류에 적힌 역할만 옮겼어요. 누가 옳은지는 정하지 않아요. 질문자가 고른 자리:{" "}
              {MY_SIDE_LABEL[example.mySide]}
            </p>
          </div>

          <div className="rounded-card border-note-line bg-note border px-4 py-3.5">
            <h2 className="text-ink text-[15px] font-semibold">질문창에 적은 글</h2>
            <p className="text-ink mt-1 text-[14px] leading-relaxed">{example.userQuestion}</p>
            <p className="text-muted mt-2 text-[12px]">
              읽은 내용과 합쳐 {example.question.length.toLocaleString("ko-KR")}자로 분석했어요
              (DeepSearch).
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
