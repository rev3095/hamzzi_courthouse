// 첨부 자료 정리 (F-017, DEC-058): 자료 지도 · 자료 카드(읽은 내용·적힌 내용·확인하지 못한 것) · 참고한 답변 문단 · 활용 안내.
// 재료는 결과의 materials(가린 판독 정리)와 검증을 통과한 답변 문단뿐이다 — 그림을 위해 모델을 더 부르지 않는다.
// 활용 안내는 자료 종류별 고정 문안이다(lib/materials/tips). 증거로서의 힘·유불리·점수는 그리지 않는다 (절대 규칙 2).
// 사진은 저장하지 않아 결과 화면에는 보이지 않는다 — 종류 표시만 한다.
import { parseMaterialsMap, type MaterialsMap } from "@/lib/materials/map";
import { MATERIAL_COMMON_TIPS, MATERIAL_TIPS } from "@/lib/materials/tips";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { wrapText } from "./DeepMapView";
import { ZoomPane } from "./ZoomPane";

type Result = Pick<DemoAnalysisResult, "materials" | "answer" | "mode"> & { aiNotice: string };

const W = 760;
const LINE = 19;

const pointsText = (points: number[]) => points.map((p) => p + 1).join(" · ");

/** 좁은 화면: 그림 대신 세로 목록 */
function MapCompact({
  map,
  linked,
  linkable,
}: {
  map: MaterialsMap;
  linked: number;
  linkable: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={`자료 지도: 자료 ${map.items.length}건, 답변에서 참고한 자료 ${linked}건`}
      className="flex flex-col gap-2 px-2 md:hidden"
    >
      <p className="rounded-card bg-ink px-4 py-3 text-white">
        <span className="text-[16px] font-bold">내 자료</span>
        <span className="ml-2 text-[13px]">
          {map.items.length}건{linkable && ` · 답변에서 참고 ${linked}건`}
        </span>
      </p>
      <ol className="flex flex-col gap-1.5">
        {map.items.map((m, i) => (
          <li
            key={i}
            className="rounded-card border-gold-line bg-cream text-ink border px-3 py-2 text-[14px]"
          >
            <span className="font-semibold">
              자료 {i + 1} · {m.kind}
            </span>
            {linkable && (
              <span className="text-link block text-xs">
                {m.points.length > 0
                  ? `답변 문단 ${pointsText(m.points)}번에서 참고`
                  : "답변 문단과 이어지지 않았어요"}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 넓은 화면: 가운데 "내 자료", 오른쪽 자료 카드(참고한 문단), 왼쪽 확인하지 못한 것 */
function MapWide({
  map,
  linked,
  linkable,
}: {
  map: MaterialsMap;
  linked: number;
  linkable: boolean;
}) {
  const right = map.items.map((m, i) => {
    const title = wrapText(`자료 ${i + 1} · ${m.kind}`, 18, 1);
    const body = wrapText(m.summary, 20, 2);
    const link = !linkable
      ? ""
      : m.points.length > 0
        ? `답변 문단 ${pointsText(m.points)}번에서 참고`
        : "답변과 이어지지 않음";
    return { title, body, link, h: 26 + (title.length + body.length) * LINE + 18 };
  });
  const gaps = map.items
    .flatMap((m, i) => m.gaps.map((g) => `자료 ${i + 1}: ${g}`))
    .slice(0, 4)
    .map((g) => ({ lines: wrapText(g, 15, 3) }));
  const hOf = (n: { lines: string[] }) => 20 + n.lines.length * LINE;
  const GAP = 26;
  const rightH = right.reduce((s, n) => s + n.h + GAP, -GAP);
  const leftH = (gaps.length ? 26 : 0) + gaps.reduce((s, n) => s + hOf(n) + GAP, -GAP);
  const H = Math.max(rightH, leftH, 180) + 60;
  const cx = W / 2;
  const cy = H / 2;

  let y = (H - rightH) / 2;
  const R = right.map((n) => {
    const box = { ...n, x: 500, y, w: 240 };
    y += n.h + GAP;
    return box;
  });
  y = (H - leftH) / 2 + (gaps.length ? 26 : 0);
  const gapLabelY = y - 10;
  const G = gaps.map((n) => {
    const box = { ...n, x: 20, y, w: 200, h: hOf(n) };
    y += box.h + GAP;
    return box;
  });
  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };
  const text = (lines: string[], x: number, y0: number, cls: string) => (
    <text x={x} y={y0} className={cls}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : LINE}>
          {l}
        </tspan>
      ))}
    </text>
  );

  return (
    <div className="hidden md:block">
      <ZoomPane width={W} height={H} label="자료 지도">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label={`자료 지도: 자료 ${map.items.length}건, 답변에서 참고한 자료 ${linked}건, 확인하지 못한 것 ${gaps.length}개`}
          className="block bg-white"
        >
          <g fill="none" strokeWidth="1.5">
            {R.map((n, i) => (
              <path
                key={`r${i}`}
                d={curve(cx + 62, cy, n.x, n.y + n.h / 2)}
                stroke={map.items[i].points.length > 0 ? "var(--gold)" : "var(--line)"}
                strokeDasharray={map.items[i].points.length > 0 ? undefined : "4 4"}
              />
            ))}
            {G.map((n, i) => (
              <path
                key={`g${i}`}
                d={curve(cx - 62, cy, n.x + n.w, n.y + n.h / 2)}
                stroke="var(--line)"
                strokeDasharray="4 4"
              />
            ))}
          </g>
          <circle cx={cx} cy={cy} r="62" fill="var(--ink)" />
          <text x={cx} y={cy - 4} textAnchor="middle" className="fill-white text-[16px] font-bold">
            내 자료
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" className="fill-white text-[11px]">
            {map.items.length}건{linkable && ` · 참고 ${linked}건`}
          </text>
          {R.map((n, i) => (
            <g key={`rb${i}`}>
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx="10"
                fill="var(--cream)"
                stroke="var(--gold-line)"
              />
              {text(n.title, n.x + 12, n.y + 24, "fill-[var(--ink)] text-[13px] font-semibold")}
              {text(n.body, n.x + 12, n.y + 24 + LINE, "fill-[var(--ink)] text-[12px]")}
              <text
                x={n.x + 12}
                y={n.y + 24 + (n.title.length + n.body.length) * LINE + 4}
                className="fill-[var(--link)] text-[11px]"
              >
                {n.link}
              </text>
            </g>
          ))}
          {G.length > 0 && (
            <text x={20} y={gapLabelY} className="fill-[var(--muted)] text-[11px] font-semibold">
              확인하지 못한 것
            </text>
          )}
          {G.map((n, i) => (
            <g key={`gb${i}`}>
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx="10"
                fill="var(--soft)"
                stroke="var(--line)"
                strokeDasharray="4 4"
              />
              {text(n.lines, n.x + 12, n.y + 23, "fill-[var(--ink)] text-[12px]")}
            </g>
          ))}
        </svg>
      </ZoomPane>
    </div>
  );
}

/** 답변 문단 i가 참고한 자료 번호 (1부터). 결과 화면의 문단 옆 표시에 쓴다 */
export function materialsOfPoint(result: Pick<DemoAnalysisResult, "materials">, i: number) {
  const map = parseMaterialsMap(result.materials);
  if (!map) return [];
  return map.items.flatMap((m, n) => (m.points.includes(i) ? [n + 1] : []));
}

/**
 * variant: result = 분석 결과 화면(답변 문단과 잇는다), search = 검색 화면(답변이 없어 연결을 보이지 않는다)
 */
export function MaterialsView({
  result,
  variant = "result",
  onClose,
}: {
  result: Result;
  variant?: "result" | "search";
  /** 검색 화면에서 정리를 닫을 때 */
  onClose?: () => void;
}) {
  const map = parseMaterialsMap(result.materials);
  if (!map) return null;
  const linkable = variant === "result";
  const linked = map.items.filter((m) => m.points.length > 0).length;
  const noAnswer = linkable && (result.mode !== "ai" || result.answer.points.length === 0);

  return (
    <section
      aria-labelledby="materials-map-title"
      className="rounded-card border-line mt-6 border"
      data-testid="materials-view"
    >
      <header className="border-line border-b px-4 py-3 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="materials-map-title" className="font-display text-ink text-[19px] font-bold">
            첨부 자료 정리
          </h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-ink min-h-11 px-2 text-[13px] underline-offset-2 hover:underline"
            >
              정리 닫기
            </button>
          )}
        </div>
        <p className="text-muted mt-0.5 text-[13px] leading-relaxed">
          {result.aiNotice} · 올린 사진에서 AI가 읽은 내용을 개인정보를 가려 정리했어요. 사진은
          저장하지 않았어요. 법령·판례 근거가 아니라 내 자료이고, 자료가 증거로서 어떤 의미가 있는지
          판단한 것이 아니에요.
        </p>
      </header>

      <div className="px-2 py-3 sm:px-4">
        <MapCompact map={map} linked={linked} linkable={linkable} />
        <MapWide map={map} linked={linked} linkable={linkable} />
        {noAnswer && (
          <p className="text-muted px-2 pt-1 text-[13px]">
            이번에는 AI 답변이 없어 자료와 답변 문단을 잇지 못했어요.
          </p>
        )}
      </div>

      <ol className="border-line flex flex-col border-t">
        {map.items.map((m, i) => {
          const tips = MATERIAL_TIPS[m.kind];
          return (
            <li key={i} className="border-line border-b px-4 py-4 last:border-b-0 sm:px-5">
              <p className="flex flex-wrap items-center gap-2">
                <span className="bg-ink rounded-[6px] px-2 py-0.5 text-xs font-bold text-white">
                  자료 {i + 1}
                </span>
                <span className="bg-cream text-label rounded-[6px] px-2 py-0.5 text-xs font-semibold">
                  {m.kind}
                </span>
              </p>
              <p className="text-ink mt-2 text-[15px] leading-relaxed">{m.summary}</p>

              {m.details.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-ink text-[14px] font-semibold">사진에 적힌 내용</h3>
                  <p className="text-muted text-[12px]">
                    적힌 그대로 옮긴 것이에요. 원본과 같은지 확인해 주세요.
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {m.details.map((d, j) => (
                      <li
                        key={j}
                        className="bg-soft text-ink rounded-[8px] px-3 py-1.5 text-[14px]"
                      >
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {m.gaps.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-ink text-[14px] font-semibold">확인하지 못한 것</h3>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {m.gaps.map((g, j) => (
                      <li key={j} className="text-ink flex gap-2 text-[14px] leading-relaxed">
                        <span
                          aria-hidden="true"
                          className="border-line mt-1.5 size-3.5 shrink-0 rounded-[4px] border"
                        />
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {linkable && (
                <p className="text-muted mt-3 text-[13px]">
                  {m.points.length > 0 ? (
                    <>
                      이 자료를 참고한 답변:{" "}
                      {m.points.map((p, j) => (
                        <span key={p}>
                          {j > 0 && " · "}
                          <a
                            href={`#point-${p + 1}`}
                            className="text-link underline-offset-2 hover:underline"
                          >
                            문단 {p + 1}
                          </a>
                        </span>
                      ))}
                    </>
                  ) : (
                    "이 자료를 참고한 답변 문단은 없어요."
                  )}
                </p>
              )}

              <div className="rounded-card border-line bg-cream mt-3 border px-4 py-3">
                <h3 className="text-ink text-[14px] font-semibold">이렇게 챙겨 두세요</h3>
                <ul className="text-ink mt-1 list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
                  {tips.keep.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <h3 className="text-ink mt-2 text-[14px] font-semibold">함께 낼 수 있는 곳</h3>
                <ul className="text-ink mt-1 list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
                  {tips.useIn.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="border-line border-t px-4 py-3 sm:px-5">
        <ul className="text-muted list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
          {MATERIAL_COMMON_TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="text-muted mt-1.5 text-[12px]">
          챙겨 두기·낼 수 있는 곳은 자료 종류별로 정해 둔 안내예요 (AI가 쓴 문장이 아니에요).
        </p>
      </footer>
    </section>
  );
}
