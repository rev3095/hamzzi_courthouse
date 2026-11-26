"use client";
// 사건 정리판 그림 부품 (DEC-062). 칸(열)마다 상자를 쌓고, 상자끼리 곡선으로 잇는 한 장짜리 SVG.
// 색·글꼴을 속성으로 직접 적어(CSS 변수·클래스 없음) 그대로 PNG 한 장으로 저장할 수 있다.
// 재료는 결과에 이미 있는 값(사건 구조·검증을 통과한 문단·근거 이름)뿐이다 — 그림을 위해 모델을 부르지 않는다.
import { useRef, useState } from "react";
import { wrapText } from "./DeepMapView";
import { ZoomPane } from "./ZoomPane";

/** globals.css 토큰과 같은 값 (PNG로 내보낼 때 CSS 변수를 읽을 수 없어 값으로 둔다) */
export const C = {
  ink: "#1a2233",
  muted: "#5a6272",
  gold: "#a9873c",
  goldLine: "#e3d6b5",
  cream: "#f4eee1",
  honey: "#fff4de",
  line: "#e6e2d8",
  soft: "#f6f5f1",
  link: "#8a6a24",
  label: "#6b5420",
  white: "#ffffff",
} as const;

const FONT = "'IBM Plex Sans KR', 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif";

export type Tone = "ink" | "gold" | "cream" | "white" | "soft" | "dash";

export type BoardNode = {
  id: string;
  text: string;
  /** 상자 아래 작은 글씨 (근거 이름, 자리 등) */
  sub?: string;
  tone?: Tone;
};

export type BoardColumn = { title: string; nodes: BoardNode[]; width?: number };

const TONES: Record<Tone, { fill: string; stroke: string; text: string; dash?: string }> = {
  ink: { fill: C.ink, stroke: C.ink, text: C.white },
  gold: { fill: C.honey, stroke: C.gold, text: C.ink },
  cream: { fill: C.cream, stroke: C.goldLine, text: C.ink },
  white: { fill: C.white, stroke: C.line, text: C.ink },
  soft: { fill: C.soft, stroke: C.line, text: C.ink },
  dash: { fill: C.soft, stroke: C.line, text: C.ink, dash: "4 4" },
};

// 여백 원칙 (DEC-065): 상자 사이·상자 안을 넉넉히 둔다. 한 화면에 다 담으려고 줄이지 않고 ZoomPane에서 옮겨 본다
const PAD = 32;
const GAP_X = 88;
const GAP_Y = 22;
const FS = 16;
const LH = 24;
const SUB_FS = 13;
/** 상자 안쪽 여백 */
const IN = 14;
const COL_W = 228;
const HEAD = 84;
const COL_HEAD = 30;

type Laid = BoardNode & {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  subLines: string[];
};

/** 칸·상자 배치 (순수 계산) */
export function layoutBoard(columns: BoardColumn[]) {
  let x = PAD;
  const laid: Laid[][] = columns.map((col) => {
    const w = col.width ?? COL_W;
    const per = Math.max(6, Math.floor((w - IN * 2) / FS));
    const nodes = col.nodes.map((n) => {
      const lines = wrapText(n.text, per, 4);
      const subLines = n.sub ? wrapText(n.sub, Math.floor((w - IN * 2) / SUB_FS), 2) : [];
      const h = IN * 2 - 4 + lines.length * LH + (subLines.length ? subLines.length * 18 + 6 : 0);
      return { ...n, x, y: 0, w, h, lines, subLines };
    });
    x += w + GAP_X;
    return nodes;
  });
  const colH = laid.map((ns) => ns.reduce((s, n) => s + n.h + GAP_Y, -GAP_Y));
  const bodyH = Math.max(120, ...colH);
  laid.forEach((ns, i) => {
    let y = HEAD + COL_HEAD + (bodyH - Math.max(0, colH[i])) / 2;
    for (const n of ns) {
      n.y = y;
      y += n.h + GAP_Y;
    }
  });
  const width = x - GAP_X + PAD;
  const height = HEAD + COL_HEAD + bodyH + 56;
  return { laid, width, height, bodyH };
}

export function BoardDiagram({
  title,
  badges = [],
  columns,
  links = [],
  footer,
  label,
  fileName,
}: {
  title: string;
  badges?: string[];
  columns: BoardColumn[];
  /** [보내는 상자 id, 받는 상자 id]. 같은 칸이면 세로선, 다른 칸이면 곡선 */
  links?: [string, string][];
  /** 그림 맨 아래 한 줄 (AI 고지 등) */
  footer?: string;
  /** 화면 읽기 도구용 설명 */
  label: string;
  /** PNG 파일 이름 (확장자 없이) */
  fileName: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const cols = columns.filter((c) => c.nodes.length > 0);
  const { laid, width, height } = layoutBoard(cols);
  const byId = new Map(laid.flat().map((n) => [n.id, n]));
  const colOf = new Map(laid.flatMap((ns, i) => ns.map((n) => [n.id, i] as const)));

  const badgeBoxes = badges.reduce<{ text: string; x: number; w: number }[]>((acc, b) => {
    const prev = acc[acc.length - 1];
    acc.push({ text: b, x: prev ? prev.x + prev.w + 6 : PAD, w: 16 + [...b].length * 12 });
    return acc;
  }, []);
  return (
    <ZoomPane
      width={width}
      height={height}
      label={label}
      actions={<SaveImage svg={ref} fileName={fileName} />}
    >
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={label}
        className="block"
        fontFamily={FONT}
      >
        <rect width={width} height={height} rx="14" fill={C.white} stroke={C.line} />
        <rect x="0" y="0" width={width} height={HEAD - 14} rx="14" fill={C.ink} />
        <rect x="0" y={HEAD - 34} width={width} height="20" fill={C.ink} />
        <text x={PAD} y={36} fill={C.white} fontSize="22" fontWeight="700">
          {title}
        </text>
        {badgeBoxes.map((b) => (
          <g key={b.text}>
            <rect x={b.x} y={46} width={b.w} height={20} rx="10" fill={C.gold} />
            <text
              x={b.x + b.w / 2}
              y={60}
              textAnchor="middle"
              fill={C.white}
              fontSize="11.5"
              fontWeight="700"
            >
              {b.text}
            </text>
          </g>
        ))}

        {cols.map((col, i) => {
          const first = laid[i][0];
          return (
            <text
              key={col.title}
              x={first.x}
              y={HEAD + 14}
              fill={C.muted}
              fontSize="12"
              fontWeight="700"
            >
              {col.title}
            </text>
          );
        })}

        <g fill="none" strokeWidth="1.5">
          {links.map(([a, b], i) => {
            const s = byId.get(a);
            const t = byId.get(b);
            if (!s || !t) return null;
            if (colOf.get(a) === colOf.get(b)) {
              const xm = s.x + 18;
              return (
                <path
                  key={i}
                  d={`M${xm},${s.y + s.h} L${xm},${t.y}`}
                  stroke={C.gold}
                  markerEnd="url(#hz-arrow)"
                />
              );
            }
            const [l, r] = s.x < t.x ? [s, t] : [t, s];
            const x1 = l.x + l.w;
            const y1 = l.y + l.h / 2;
            const x2 = r.x;
            const y2 = r.y + r.h / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                stroke={C.goldLine}
              />
            );
          })}
        </g>
        <defs>
          <marker
            id="hz-arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="9"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0,0 L10,0 L5,10 z" fill={C.gold} transform="rotate(-90 5 5)" />
          </marker>
        </defs>

        {laid.flat().map((n) => {
          const t = TONES[n.tone ?? "white"];
          return (
            <g key={n.id}>
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx="10"
                fill={t.fill}
                stroke={t.stroke}
                strokeDasharray={t.dash}
              />
              <text x={n.x + IN} y={n.y + IN + LH - 8} fill={t.text} fontSize={FS} fontWeight="600">
                {n.lines.map((l, j) => (
                  <tspan key={j} x={n.x + IN} dy={j === 0 ? 0 : LH}>
                    {l}
                  </tspan>
                ))}
              </text>
              {n.subLines.map((l, j) => (
                <text
                  key={j}
                  x={n.x + IN}
                  y={n.y + IN + n.lines.length * LH + 8 + j * 18}
                  fill={n.tone === "ink" ? C.goldLine : C.link}
                  fontSize={SUB_FS}
                >
                  {l}
                </text>
              ))}
            </g>
          );
        })}

        {footer && (
          <text x={PAD} y={height - 22} fill={C.muted} fontSize="13">
            {footer}
          </text>
        )}
      </svg>
    </ZoomPane>
  );
}

/** SVG → PNG 한 장 저장 (브라우저 안에서만 만든다 — 서버로 보내지 않는다) */
export function SaveImage({
  svg,
  fileName,
}: {
  svg: React.RefObject<SVGSVGElement | null>;
  fileName: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  async function save() {
    const el = svg.current;
    if (!el) return;
    setState("busy");
    try {
      const vb = el.viewBox.baseVal;
      const scale = 2;
      const xml = new XMLSerializer().serializeToString(el);
      const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      await new Promise<void>((ok, fail) => {
        img.onload = () => ok();
        img.onerror = () => fail(new Error("image"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = vb.width * scale;
      canvas.height = vb.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.fillStyle = C.white;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const png = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
      if (!png) throw new Error("png");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = `${fileName}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      setState("idle");
    } catch {
      setState("failed");
    }
  }
  return (
    <button
      type="button"
      onClick={save}
      disabled={state === "busy"}
      className="rounded-button border-line text-ink min-h-9 border bg-white px-3 text-[13px] disabled:opacity-60"
    >
      {state === "busy"
        ? "만드는 중…"
        : state === "failed"
          ? "다시 시도 (이미지 저장)"
          : "이미지로 저장"}
    </button>
  );
}
