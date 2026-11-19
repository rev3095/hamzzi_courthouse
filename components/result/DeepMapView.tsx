// DeepSearch 시각자료 (DEC-041): 사건 구조도(마인드맵) · 사실관계 흐름 · 쟁점별 근거 · 확인할 사실.
// 재료는 결과의 deep(사건 구조)과 검증을 통과한 답변 문단뿐이다 — 그림을 위해 모델을 더 부르지 않는다.
// 개수·연결 같은 사실만 보여 준다. 유불리·가능성·점수는 그리지 않는다 (절대 규칙 2).
import { parseDeepMap, type DeepMap } from "@/lib/ai/deep-policy";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { sourceRef } from "./labels";

type Result = Pick<DemoAnalysisResult, "deep" | "answer" | "articles" | "cases" | "aiNotice">;

/** 글자 수로 줄을 나눈다 (SVG 글자는 자동으로 줄이 바뀌지 않는다) */
export function wrapText(text: string, perLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  let rest = text.trim();
  while (rest && lines.length < maxLines) {
    if (rest.length <= perLine) {
      lines.push(rest);
      rest = "";
      break;
    }
    // 낱말 사이에서 자르되, 마땅한 곳이 없으면 글자 수로 자른다
    const cut = rest.lastIndexOf(" ", perLine);
    const at = cut >= perLine * 0.5 ? cut : perLine;
    lines.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, perLine - 1)}…`;
  return lines;
}

/** 쟁점마다 남은 문단이 쓴 근거 이름 (중복 없이) */
export function issueSources(map: DeepMap, result: Result): string[][] {
  return map.issues.map((issue) => {
    const labels: string[] = [];
    for (const i of issue.points) {
      const p = result.answer.points[i];
      if (!p) continue;
      const label = sourceRef(p.source, result as DemoAnalysisResult).label;
      if (!labels.includes(label)) labels.push(label);
    }
    return labels;
  });
}

const W = 760;
const LINE = 17;

function Mindmap({ map, sources }: { map: DeepMap; sources: string[][] }) {
  // 오른쪽: 쟁점(아래에 근거 이름). 왼쪽: 당사자, 그 아래 확인할 사실
  const right = map.issues.map((issue, i) => {
    const title = wrapText(`${i + 1}. ${issue.title}`, 17, 3);
    const src = sources[i].slice(0, 3).map((s) => wrapText(s, 22, 1)[0]);
    return { title, src, h: 22 + title.length * LINE + src.length * 15 + (src.length ? 8 : 0) };
  });
  const leftTop = map.parties.map((p) => ({
    lines: wrapText(p.role ? `${p.label} · ${p.role}` : p.label, 14, 2),
  }));
  const leftBottom = map.unknowns.slice(0, 4).map((u) => ({ lines: wrapText(u, 15, 3) }));
  const hOf = (n: { lines: string[] }) => 20 + n.lines.length * LINE;
  const GAP = 14;
  const rightH = right.reduce((s, n) => s + n.h + GAP, -GAP);
  const leftH =
    leftTop.reduce((s, n) => s + hOf(n) + GAP, 0) +
    (leftBottom.length ? 26 : 0) +
    leftBottom.reduce((s, n) => s + hOf(n) + GAP, -GAP);
  const H = Math.max(rightH, leftH, 200) + 60;
  const cx = W / 2;
  const cy = H / 2;

  let y = (H - rightH) / 2;
  const R = right.map((n) => {
    const box = { ...n, x: 520, y, w: 220 };
    y += n.h + GAP;
    return box;
  });
  y = (H - leftH) / 2;
  const P = leftTop.map((n) => {
    const box = { ...n, x: 20, y, w: 190, h: hOf(n) };
    y += box.h + GAP;
    return box;
  });
  y += leftBottom.length ? 26 : 0;
  const unknownLabelY = y - 10;
  const U = leftBottom.map((n) => {
    const box = { ...n, x: 20, y, w: 190, h: hOf(n) };
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
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`사건 구조도: 당사자 ${map.parties.length}, 쟁점 ${map.issues.length}, 확인할 사실 ${map.unknowns.length}`}
        className="h-auto w-full min-w-[640px]"
      >
        <g fill="none" strokeWidth="1.5">
          {R.map((n, i) => (
            <path key={`r${i}`} d={curve(cx + 62, cy, n.x, n.y + n.h / 2)} stroke="var(--gold)" />
          ))}
          {P.map((n, i) => (
            <path
              key={`p${i}`}
              d={curve(cx - 62, cy, n.x + n.w, n.y + n.h / 2)}
              stroke="var(--line)"
            />
          ))}
          {U.map((n, i) => (
            <path
              key={`u${i}`}
              d={curve(cx - 62, cy, n.x + n.w, n.y + n.h / 2)}
              stroke="var(--line)"
              strokeDasharray="4 4"
            />
          ))}
        </g>

        <circle cx={cx} cy={cy} r="62" fill="var(--ink)" />
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-white text-[16px] font-bold">
          이 사건
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="fill-white text-[11px]">
          쟁점 {map.issues.length} · 근거 {new Set(sources.flat()).size}
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
            {n.src.map((s, j) => (
              <text
                key={j}
                x={n.x + 12}
                y={n.y + 24 + n.title.length * LINE + 6 + j * 15}
                className="fill-[var(--link)] text-[11px]"
              >
                {s}
              </text>
            ))}
          </g>
        ))}
        {P.map((n, i) => (
          <g key={`pb${i}`}>
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx="10"
              fill="white"
              stroke="var(--line)"
            />
            {text(n.lines, n.x + 12, n.y + 23, "fill-[var(--ink)] text-[13px] font-semibold")}
          </g>
        ))}
        {U.length > 0 && (
          <text x={20} y={unknownLabelY} className="fill-[var(--muted)] text-[11px] font-semibold">
            확인할 사실
          </text>
        )}
        {U.map((n, i) => (
          <g key={`ub${i}`}>
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
    </div>
  );
}

export function DeepMapView({ result }: { result: Result }) {
  const map = parseDeepMap(result.deep);
  if (!map) return null;
  const sources = issueSources(map, result);

  return (
    <section aria-labelledby="deep-map-title" className="rounded-card border-line mt-6 border">
      <header className="border-line border-b px-4 py-3 sm:px-5">
        <h2 id="deep-map-title" className="font-display text-ink text-[19px] font-bold">
          DeepSearch · 사건 구조
        </h2>
        <p className="text-muted mt-0.5 text-[13px] leading-relaxed">
          {result.aiNotice} · 적어 주신 사연에서 뽑은 구조와, 인용 확인을 통과한 답변 문단만으로
          그렸어요. 사건의 결과를 판단한 그림이 아니에요.
        </p>
      </header>

      <div className="px-2 py-3 sm:px-4">
        <Mindmap map={map} sources={sources} />
      </div>

      {map.events.length > 0 && (
        <div className="border-line border-t px-4 py-4 sm:px-5">
          <h3 className="text-ink text-[15px] font-bold">사실관계 흐름</h3>
          <p className="text-muted text-[13px]">사연에 적힌 순서대로예요.</p>
          <ol className="mt-3 flex flex-col gap-0">
            {map.events.map((e, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < map.events.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="bg-line absolute top-7 bottom-0 left-[13px] w-px"
                  />
                )}
                <span className="bg-ink z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs">
                    {e.who && (
                      <span className="bg-cream text-label rounded-[6px] px-2 py-0.5 font-semibold">
                        {e.who}
                      </span>
                    )}
                    {e.when && <span className="text-muted">{e.when}</span>}
                  </p>
                  <p className="text-ink mt-1 text-[15px] leading-relaxed">{e.what}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="border-line border-t px-4 py-4 sm:px-5">
        <h3 className="text-ink text-[15px] font-bold">쟁점별 근거</h3>
        <ul className="mt-3 flex flex-col gap-3">
          {map.issues.map((issue, i) => (
            <li key={i} className="rounded-card bg-soft px-4 py-3">
              <p className="text-ink text-[15px] font-semibold">
                {i + 1}. {issue.title}
              </p>
              {issue.points.length > 0 ? (
                <>
                  <p className="text-muted mt-1 text-[13px]">
                    답변 문단 {issue.points.map((p) => p + 1).join(" · ")}번 · 근거{" "}
                    {sources[i].length}개
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {sources[i].map((s) => (
                      <span
                        key={s}
                        className="border-gold-line text-link rounded-full border bg-white px-2.5 py-0.5 text-xs"
                      >
                        {s}
                      </span>
                    ))}
                  </p>
                </>
              ) : (
                <p className="text-muted mt-1 text-[13px]">
                  이번에 찾은 자료로는 이 쟁점에 답하지 못했어요.
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      {map.unknowns.length > 0 && (
        <div className="border-line border-t px-4 py-4 sm:px-5">
          <h3 className="text-ink text-[15px] font-bold">확인할 사실</h3>
          <p className="text-muted text-[13px]">
            사연에 적히지 않았는데, 이 사실에 따라 답이 달라질 수 있어요.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {map.unknowns.map((u) => (
              <li key={u} className="text-ink flex gap-2 text-[15px] leading-relaxed">
                <span
                  aria-hidden="true"
                  className="border-line mt-1.5 size-3.5 shrink-0 rounded-[4px] border"
                />
                {u}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
