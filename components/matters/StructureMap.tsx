"use client";
// 사건 진행 — 구조도 (F-016 AC2, DEC-053). 당사자·계열사·기관·제3자를 서류에서의 자리(요구하는 쪽 / 받는 쪽 / 그 밖)로
// 세 줄에 놓고 관계를 선으로 잇는다. 그림은 사건 자료로 코드가 그린다 — 모델을 부르지 않는다.
// 자리는 서류의 방향일 뿐 옳고 그름이 아니다. 유불리·책임 표시는 없다 (절대 규칙 2).
// 상자에 마우스를 올리면 설명이 뜨고, 누르면 아래에서 고치거나 조사·검색·노트로 이어 간다.
import { useState } from "react";
import { AI_NOTICE } from "@/lib/api/respond";
import {
  MATTER_KINDS,
  MATTER_KIND_LABEL,
  MATTER_SIDES,
  MATTER_SIDE_LABEL,
  newId,
  type MatterData,
  type MatterKind,
  type MatterParty,
  type MatterSide,
} from "@/lib/matters/model";
import { ZoomPane } from "../result/ZoomPane";
import { AiTag, ConfirmButton, Empty, Hover, SectionTitle, btn, btnLine, field, label } from "./ui";

// 여백 원칙 (DEC-065): 상자 사이를 넉넉히 두고, 한 화면에 다 담으려고 줄이지 않는다 — ZoomPane에서 옮겨 본다
const W = 236;
const H = 64;
const GAP = 30;
const TOP = 52;
const COL: Record<MatterSide, number> = { claimant: 28, respondent: 420, other: 812 };
const WIDTH = 1076;

const SHAPE: Record<MatterKind, string> = {
  business: "border-ink border-2 rounded-[4px]",
  agency: "border-ink border-2 border-dashed rounded-[4px]",
  person: "border-ink border rounded-full",
  group: "border-muted border border-dotted rounded-[4px]",
};

export function StructureMap({
  data,
  update,
  onCompany,
  onSearch,
  onNote,
}: {
  data: MatterData;
  update: (fn: (d: MatterData) => MatterData) => void;
  /** 회사 상자에서 기업 조사로 */
  onCompany: (party: MatterParty) => void;
  /** 법령·판례 찾기로 (검색어를 넘긴다) */
  onSearch: (query: string) => void;
  /** 이 당사자에 메모 붙이기 */
  onNote: (party: MatterParty) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    kind: "business" as MatterKind,
    side: "other" as MatterSide,
  });
  const [rel, setRel] = useState({ to: "", label: "" });

  const columns = MATTER_SIDES.map((side) => data.parties.filter((p) => p.side === side));
  const rows = Math.max(1, ...columns.map((c) => c.length));
  // 아래쪽 상자의 설명 창이 그림 밖으로 잘리지 않게 여백을 둔다
  const height = TOP + rows * (H + GAP) + 120;
  const pos = new Map<string, { x: number; y: number }>();
  columns.forEach((list, c) =>
    list.forEach((p, i) => pos.set(p.id, { x: COL[MATTER_SIDES[c]], y: TOP + i * (H + GAP) })),
  );
  const current = data.parties.find((p) => p.id === selected) ?? null;
  const nameOf = (id: string) => data.parties.find((p) => p.id === id)?.name ?? "";

  const patch = (id: string, change: Partial<MatterParty>) =>
    update((d) => ({
      ...d,
      parties: d.parties.map((p) => (p.id === id ? { ...p, ...change } : p)),
    }));

  return (
    <section>
      <SectionTitle
        title="구조도"
        hint="서류에서의 자리로 나눈 그림이에요. 누가 옳은지를 나타내지 않아요. 서류에서 읽은 당사자와 설명은 AI가 옮긴 것이라 원문과 대조해 주세요. 상자에 마우스를 올리면 설명이, 누르면 고치기와 이어 찾기가 나와요."
        right={data.docs.length > 0 ? <AiTag notice={AI_NOTICE} /> : null}
      />
      {data.parties.length === 0 ? (
        <div className="mt-3">
          <Empty>아직 당사자가 없어요. 자료 탭에서 서류를 읽거나 아래에서 직접 더해 주세요.</Empty>
        </div>
      ) : (
        <div>
          <ZoomPane width={WIDTH} height={height} label="구조도">
            <div
              className="relative bg-white"
              style={{ width: WIDTH, height }}
              data-testid="structure-map"
            >
              {MATTER_SIDES.map((side) => (
                <p
                  key={side}
                  className={`${label} absolute top-3`}
                  style={{ left: COL[side], width: W }}
                >
                  {MATTER_SIDE_LABEL[side]}
                </p>
              ))}
              <svg width={WIDTH} height={height} className="absolute inset-0" aria-hidden="true">
                {data.relations.map((r) => {
                  const a = pos.get(r.from);
                  const b = pos.get(r.to);
                  if (!a || !b) return null;
                  const ay = a.y + H / 2;
                  const by = b.y + H / 2;
                  if (a.x === b.x) {
                    // 같은 줄: 오른쪽으로 휘어 잇는다
                    const x = a.x + W;
                    const bend = 26 + (Math.abs(by - ay) / (H + GAP)) * 6;
                    return (
                      <g key={r.id}>
                        <path
                          d={`M${x},${ay} C${x + bend},${ay} ${x + bend},${by} ${x},${by}`}
                          fill="none"
                          stroke="#1a2233"
                          strokeWidth="1.2"
                        />
                        <EdgeLabel
                          x={x + bend - 2}
                          y={(ay + by) / 2}
                          text={r.label}
                          anchor="start"
                        />
                      </g>
                    );
                  }
                  const [l, r2] = a.x < b.x ? [a, b] : [b, a];
                  const x1 = l.x + W;
                  const x2 = r2.x;
                  const y1 = l.y + H / 2;
                  const y2 = r2.y + H / 2;
                  return (
                    <g key={r.id}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1a2233" strokeWidth="1.2" />
                      <EdgeLabel
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2}
                        text={r.label}
                        anchor="middle"
                      />
                    </g>
                  );
                })}
              </svg>
              {data.parties.map((p) => {
                const at = pos.get(p.id);
                if (!at) return null;
                const links = data.relations.filter((r) => r.from === p.id || r.to === p.id);
                return (
                  <div
                    key={p.id}
                    className="absolute"
                    style={{ left: at.x, top: at.y, width: W, height: H }}
                  >
                    <Hover
                      plain
                      className="size-full"
                      align={p.side === "other" ? "right" : "left"}
                      panel={
                        <>
                          <span className="block font-semibold">{p.name}</span>
                          <span className="text-muted block">
                            {MATTER_KIND_LABEL[p.kind]}
                            {p.role ? ` · ${p.role}` : ""}
                          </span>
                          {p.note && <span className="mt-1 block">{p.note}</span>}
                          {links.length > 0 && (
                            <span className="mt-1 block">
                              {links
                                .map(
                                  (r) => `${r.label}: ${nameOf(r.from === p.id ? r.to : r.from)}`,
                                )
                                .join(" / ")}
                            </span>
                          )}
                        </>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(p.id === selected ? null : p.id)}
                        aria-pressed={p.id === selected}
                        style={{ width: W, height: H }}
                        className={`flex flex-col items-start justify-center px-3 text-left ${SHAPE[p.kind]} ${
                          p.id === selected ? "bg-ink text-white" : "text-ink bg-white"
                        }`}
                      >
                        <span className="w-full truncate text-[14px] font-semibold">{p.name}</span>
                        <span
                          className={`w-full truncate text-[12px] ${p.id === selected ? "text-white/70" : "text-muted"}`}
                        >
                          {p.role || MATTER_KIND_LABEL[p.kind]}
                        </span>
                      </button>
                    </Hover>
                  </div>
                );
              })}
            </div>
          </ZoomPane>
          <ul className="text-muted flex flex-wrap gap-x-4 gap-y-1 px-1 py-2 text-[12px]">
            <li>굵은 테두리 = 회사</li>
            <li>점선 = 기관</li>
            <li>둥근 테두리 = 개인</li>
            <li>가는 점선 = 집단·기타</li>
          </ul>
        </div>
      )}

      {current && (
        <div
          className="border-ink mt-3 rounded-[8px] border bg-white p-4"
          data-testid="party-panel"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>이름</span>
              <input
                className={`${field} mt-1`}
                value={current.name}
                maxLength={60}
                onChange={(e) => patch(current.id, { name: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={label}>서류에 적힌 역할</span>
              <input
                className={`${field} mt-1`}
                value={current.role}
                maxLength={40}
                onChange={(e) => patch(current.id, { role: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={label}>종류</span>
              <select
                className={`${field} mt-1`}
                value={current.kind}
                onChange={(e) => patch(current.id, { kind: e.target.value as MatterKind })}
              >
                {MATTER_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {MATTER_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>자리</span>
              <select
                className={`${field} mt-1`}
                value={current.side}
                onChange={(e) => patch(current.id, { side: e.target.value as MatterSide })}
              >
                {MATTER_SIDES.map((s) => (
                  <option key={s} value={s}>
                    {MATTER_SIDE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className={label}>설명</span>
              <textarea
                className={`${field} mt-1`}
                rows={2}
                value={current.note}
                maxLength={400}
                onChange={(e) => patch(current.id, { note: e.target.value })}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {current.kind === "business" && (
              <button type="button" className={btn} onClick={() => onCompany(current)}>
                이 회사 기업 조사
              </button>
            )}
            <button
              type="button"
              className={btnLine}
              onClick={() =>
                onSearch(current.kind === "person" ? current.role : current.role || current.name)
              }
            >
              법령·판례 찾기
            </button>
            <button type="button" className={btnLine} onClick={() => onNote(current)}>
              메모 붙이기
            </button>
            <ConfirmButton
              onConfirm={() => {
                update((d) => ({
                  ...d,
                  parties: d.parties.filter((p) => p.id !== current.id),
                  relations: d.relations.filter(
                    (r) => r.from !== current.id && r.to !== current.id,
                  ),
                }));
                setSelected(null);
              }}
            >
              지우기
            </ConfirmButton>
          </div>
          {current.kind === "person" && (
            <p className="text-muted mt-2 text-[12px] leading-relaxed">
              개인에 대해서는 웹 검색을 하지 않아요. 알고 있는 내용은 메모로 직접 붙여 주세요.
            </p>
          )}

          <div className="border-line mt-3 border-t pt-3">
            <p className={label}>관계</p>
            <ul className="mt-1 space-y-1">
              {data.relations
                .filter((r) => r.from === current.id || r.to === current.id)
                .map((r) => (
                  <li
                    key={r.id}
                    className="text-ink flex items-center justify-between gap-2 text-[13px]"
                  >
                    <span>
                      {r.label} — {nameOf(r.from === current.id ? r.to : r.from)}
                    </span>
                    <ConfirmButton
                      onConfirm={() =>
                        update((d) => ({
                          ...d,
                          relations: d.relations.filter((x) => x.id !== r.id),
                        }))
                      }
                    >
                      지우기
                    </ConfirmButton>
                  </li>
                ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                className={`${field} max-w-[220px]`}
                value={rel.to}
                onChange={(e) => setRel({ ...rel, to: e.target.value })}
                aria-label="이을 대상"
              >
                <option value="">이을 대상 고르기</option>
                {data.parties
                  .filter((p) => p.id !== current.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <input
                className={`${field} max-w-[200px]`}
                placeholder="관계 (계약, 계열사…)"
                value={rel.label}
                maxLength={30}
                onChange={(e) => setRel({ ...rel, label: e.target.value })}
                aria-label="관계"
              />
              <button
                type="button"
                className={btnLine}
                disabled={!rel.to || !rel.label.trim()}
                onClick={() => {
                  update((d) => ({
                    ...d,
                    relations: [
                      ...d.relations,
                      { id: newId(), from: current.id, to: rel.to, label: rel.label.trim() },
                    ],
                  }));
                  setRel({ to: "", label: "" });
                }}
              >
                선 잇기
              </button>
            </div>
          </div>
        </div>
      )}

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.name.trim()) return;
          const id = newId();
          update((d) => ({
            ...d,
            parties: [
              ...d.parties,
              {
                id,
                name: draft.name.trim(),
                kind: draft.kind,
                side: draft.side,
                role: "",
                note: "",
              },
            ],
          }));
          setDraft({ ...draft, name: "" });
          setSelected(id);
        }}
      >
        <input
          className={`${field} max-w-[240px]`}
          placeholder="당사자·관계자 이름"
          value={draft.name}
          maxLength={60}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          aria-label="새 당사자 이름"
        />
        <select
          className={`${field} max-w-[130px]`}
          value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value as MatterKind })}
          aria-label="종류"
        >
          {MATTER_KINDS.map((k) => (
            <option key={k} value={k}>
              {MATTER_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          className={`${field} max-w-[200px]`}
          value={draft.side}
          onChange={(e) => setDraft({ ...draft, side: e.target.value as MatterSide })}
          aria-label="자리"
        >
          {MATTER_SIDES.map((s) => (
            <option key={s} value={s}>
              {MATTER_SIDE_LABEL[s]}
            </option>
          ))}
        </select>
        <button type="submit" className={btnLine} disabled={!draft.name.trim()}>
          더하기
        </button>
      </form>
    </section>
  );
}

function EdgeLabel({
  x,
  y,
  text,
  anchor,
}: {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle";
}) {
  const t = text.length > 12 ? `${text.slice(0, 11)}…` : text;
  const w = t.length * 11 + 10;
  return (
    <g>
      <rect
        x={anchor === "middle" ? x - w / 2 : x}
        y={y - 9}
        width={w}
        height={18}
        fill="#fff"
        stroke="#1a2233"
        strokeWidth="0.8"
        rx="2"
      />
      <text
        x={anchor === "middle" ? x : x + w / 2}
        y={y + 4}
        textAnchor="middle"
        fontSize="11"
        fill="#1a2233"
      >
        {t}
      </text>
    </g>
  );
}
