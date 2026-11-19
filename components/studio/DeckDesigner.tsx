"use client";
// 햄찌법원 편집기 · 발표 자료 디자인 탭. claude.ai 아티팩트 "발표 자료 디자인 편집기"를 옮겨 와 편집기 하나로 묶었다.
// 시안·색·글꼴·표지·카드 모양을 바꿔 보고 "선택 결과"를 복사해 채팅에 붙이면 Claude가 그대로 PPT를 다시 만든다.
// 슬라이드 내용은 deck-slides.tsx(아티팩트 "햄찌법원 발표 자료" 2026-11-15판 9장). 표지·약속 캐릭터는 마스코트 리소스 탭의 상태 그림.
import { useState, type CSSProperties } from "react";
import { MASCOT_MOODS, MOOD_INFO, type MascotMood } from "@/lib/mascot/moods";
import { DeckSlides, ProblemSlide } from "./deck-slides";
import "./deck.css";
import { Segmented } from "./ui";

type FontKey = "Noto Sans KR" | "IBM Plex Sans KR" | "Malgun Gothic";
type Design = {
  bg: string;
  fg: string;
  mu: string;
  ac: string;
  card: string;
  ln: string;
  dark: string;
  tb: "dark" | "light" | "accent";
  cs: "card" | "line";
  r: number;
  font: FontKey;
  hf: "same" | "serif";
};
type PresetKey = "mono" | "navy" | "dark" | "soft";

const PRESETS: Record<PresetKey, Design & { name: string; desc: string }> = {
  mono: {
    name: "A. 모노 비즈니스",
    desc: "흰 바탕, 검정 글씨, 포인트 한 색, 가는 선",
    bg: "#ffffff",
    fg: "#111318",
    mu: "#6e7280",
    ac: "#2f5bea",
    card: "#f5f6f8",
    ln: "#dfe1e7",
    dark: "#111318",
    tb: "light",
    cs: "line",
    r: 0,
    font: "Noto Sans KR",
    hf: "same",
  },
  navy: {
    name: "B. 클린 네이비",
    desc: "흰 바탕, 남색 글씨, 주황 포인트, 지금 브랜드를 다듬은 안",
    bg: "#ffffff",
    fg: "#1c2033",
    mu: "#6b7080",
    ac: "#e08a1e",
    card: "#f4f4f1",
    ln: "#e4e2db",
    dark: "#1c2033",
    tb: "dark",
    cs: "card",
    r: 1.2,
    font: "Noto Sans KR",
    hf: "same",
  },
  dark: {
    name: "C. 다크 프리미엄",
    desc: "전체 어두운 바탕, 밝은 글씨, 금색 포인트",
    bg: "#0f1424",
    fg: "#f3f4f7",
    mu: "#9aa3b5",
    ac: "#f2b24c",
    card: "#1a2136",
    ln: "#2c3552",
    dark: "#0f1424",
    tb: "dark",
    cs: "card",
    r: 1,
    font: "IBM Plex Sans KR",
    hf: "same",
  },
  soft: {
    name: "D. 소프트 브랜드",
    desc: "따뜻한 바탕, 둥근 모서리, 캐릭터가 어울리는 안",
    bg: "#fbf8f2",
    fg: "#2b2a28",
    mu: "#7a756c",
    ac: "#d9772b",
    card: "#ffffff",
    ln: "#ece5d8",
    dark: "#2b2a28",
    tb: "light",
    cs: "card",
    r: 2.2,
    font: "Noto Sans KR",
    hf: "same",
  },
};
const ACCENTS = ["#2f5bea", "#e08a1e", "#0f9d78", "#d9472b", "#7a4be0", "#111318", "#f2b24c"];
const FONT_LABEL: Record<FontKey, string> = {
  "Noto Sans KR": "Noto Sans KR (현대적, 설치 필요)",
  "IBM Plex Sans KR": "IBM Plex Sans KR (단정한 비즈니스, 설치 필요)",
  "Malgun Gothic": "맑은 고딕 (어느 PC에서나 안전)",
};
const FONT_CSS: Record<FontKey, string> = {
  "Noto Sans KR": "var(--font-noto-kr), 'Malgun Gothic', sans-serif",
  "IBM Plex Sans KR": "var(--font-plex-kr), 'Malgun Gothic', sans-serif",
  "Malgun Gothic": "'Malgun Gothic', sans-serif",
};

function rgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
const onColor = (h: string) => {
  const [r, g, b] = rgb(h);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? "#111318" : "#ffffff";
};
const mix = (h: string, a: number) => `rgba(${rgb(h).join(",")},${a})`;

function vars(c: Design): CSSProperties {
  const tbg = c.tb === "dark" ? c.dark : c.tb === "accent" ? c.ac : c.bg;
  const line = c.cs === "line";
  return {
    "--d-bg": c.bg,
    "--d-fg": c.fg,
    "--d-mu": c.mu,
    "--d-ac": c.ac,
    "--d-onac": onColor(c.ac),
    "--d-ln": c.ln,
    "--d-tbg": tbg,
    "--d-tfg": c.tb === "light" ? c.fg : onColor(tbg),
    "--d-cardbg": line ? "transparent" : c.card,
    "--d-stline": line ? `.12cqw solid ${c.ln}` : "0",
    "--d-thbg": line ? "transparent" : c.card,
    "--d-mebg": mix(c.ac, 0.1),
    "--d-r": `${c.r}cqw`,
    "--d-rule": line ? "block" : "none",
    "--d-font": FONT_CSS[c.font],
    "--d-hfont": c.hf === "serif" ? "var(--font-nanum-myeongjo), serif" : FONT_CSS[c.font],
  } as CSSProperties;
}

function summary(preset: PresetKey, d: Design) {
  const tb = { dark: "어둡게", light: "밝게", accent: "포인트 색" }[d.tb];
  return [
    `시안 ${PRESETS[preset].name.split(".")[0]}`,
    `포인트 ${d.ac}`,
    `글꼴 ${d.font}`,
    `제목 ${d.hf === "serif" ? "명조" : "본문과 같게"}`,
    `표지 ${tb}`,
    `묶음 ${d.cs === "line" ? "선만" : "카드"}`,
    `모서리 ${d.r}`,
  ].join(" / ");
}

const fieldLabel = "text-muted mb-2 block text-xs font-semibold tracking-[0.06em]";

export function DeckDesigner() {
  const [preset, setPreset] = useState<PresetKey>("mono");
  const [d, setD] = useState<Design>(PRESETS.mono);
  const [mood, setMood] = useState<MascotMood>("default");
  const [hint, setHint] = useState("복사가 안 되면 위 글자를 직접 선택해 붙여 넣으세요.");
  const set = <K extends keyof Design>(k: K, v: Design[K]) => setD((x) => ({ ...x, [k]: v }));
  const out = summary(preset, d);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(out);
      setHint("복사했어요. 채팅에 붙여 넣어 주세요.");
    } catch {
      setHint("복사가 막혀 있어요. 위 글자를 직접 선택해 붙여 넣어 주세요.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-ink text-lg font-semibold">발표 자료 디자인</h2>
          <p className="text-muted mt-1 max-w-[640px] text-[13px] leading-relaxed">
            시안을 고른 뒤 색·글꼴·표지·카드 모양을 바꿔 보세요. 미리보기는 최신 발표 자료(9장,
            2026-11-15판) 내용으로 그려요. 마음에 드는 조합의 &ldquo;선택 결과&rdquo;를 복사해
            채팅에 붙여 넣으면 그대로 PPT를 다시 만들어요.
          </p>
        </div>
      </div>

      <h3 className={`${fieldLabel} mt-6`}>1 · 시안 고르기</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => {
          const p = PRESETS[k];
          const on = preset === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setPreset(k);
                setD(p);
              }}
              className={`rounded-card border bg-white p-2.5 text-left transition-shadow ${
                on ? "border-ink ring-ink ring-1" : "border-line hover:shadow-md"
              }`}
            >
              <ProblemSlide v={vars(p)} />
              <span className="text-ink mt-2 block px-0.5 text-[14px] font-semibold">{p.name}</span>
              <span className="text-muted block px-0.5 text-[12px] leading-snug">{p.desc}</span>
            </button>
          );
        })}
      </div>

      <h3 className={`${fieldLabel} mt-8`}>2 · 세부 조정과 미리보기</h3>
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="rounded-panel border-line flex flex-col gap-5 border bg-white p-4 lg:sticky lg:top-4">
          <div>
            <span className={fieldLabel}>포인트 색</span>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-label={a}
                  aria-pressed={d.ac === a}
                  onClick={() => set("ac", a)}
                  className={`size-8 rounded-full border-2 border-white ${
                    d.ac === a ? "ring-ink ring-2" : "ring-line ring-1"
                  }`}
                  style={{ background: a }}
                />
              ))}
              <input
                type="color"
                aria-label="포인트 색 직접 고르기"
                value={d.ac}
                onChange={(e) => set("ac", e.target.value)}
                className="ring-line size-8 cursor-pointer appearance-none rounded-full border-2 border-white bg-transparent p-0 ring-1 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
              />
            </div>
          </div>
          <label>
            <span className={fieldLabel}>글꼴</span>
            <select
              value={d.font}
              onChange={(e) => set("font", e.target.value as FontKey)}
              className="rounded-button border-line text-ink min-h-10 w-full border bg-white px-2 text-[14px]"
            >
              {(Object.keys(FONT_LABEL) as FontKey[]).map((f) => (
                <option key={f} value={f}>
                  {FONT_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className={fieldLabel}>제목 글꼴</span>
            <Segmented
              hideLabel
              label="제목 글꼴"
              value={d.hf}
              onChange={(v) => set("hf", v)}
              options={[
                { value: "same", label: "본문과 같게" },
                { value: "serif", label: "명조 (격식)" },
              ]}
            />
          </div>
          <div>
            <span className={fieldLabel}>표지 배경</span>
            <Segmented
              hideLabel
              label="표지 배경"
              value={d.tb}
              onChange={(v) => set("tb", v)}
              options={[
                { value: "dark", label: "어둡게" },
                { value: "light", label: "밝게" },
                { value: "accent", label: "포인트 색" },
              ]}
            />
          </div>
          <div>
            <span className={fieldLabel}>정보 묶음 모양</span>
            <Segmented
              hideLabel
              label="정보 묶음 모양"
              value={d.cs}
              onChange={(v) => set("cs", v)}
              options={[
                { value: "card", label: "카드" },
                { value: "line", label: "선만" },
              ]}
            />
          </div>
          <label>
            <span className={fieldLabel}>모서리 둥글기 · {d.r}</span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.2}
              value={d.r}
              onChange={(e) => set("r", Number(e.target.value))}
              className="w-full accent-[var(--ink)]"
            />
          </label>
          <label>
            <span className={fieldLabel}>표지·약속 장 캐릭터</span>
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value as MascotMood)}
              className="rounded-button border-line text-ink min-h-10 w-full border bg-white px-2 text-[14px]"
            >
              {MASCOT_MOODS.map((m) => (
                <option key={m} value={m}>
                  {MOOD_INFO[m].label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className={fieldLabel}>선택 결과</span>
            <p className="rounded-card bg-soft text-ink px-3 py-2.5 font-mono text-[12px] leading-relaxed break-all">
              {out}
            </p>
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-button bg-ink mt-2 min-h-11 w-full text-[14px] font-semibold text-white"
            >
              선택 결과 복사
            </button>
            <p className="text-muted mt-2 text-[12px]">{hint}</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <DeckSlides v={vars(d)} mood={mood} />
        </div>
      </div>
    </div>
  );
}
