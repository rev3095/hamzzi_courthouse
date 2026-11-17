"use client";
// 단계별 서식 작성 (DEC-022·023·025). legal_documents 게이트가 열렸거나 관리자 미리보기(DEC-024)일 때만 서버가 그린다.
// 흐름: 설문 팝업 → 입력대로 곧바로 완성 → "이대로 내보낼까요?" 예 / 아니요(직접 수정할게요)
//       → 아니요면 웹 안 편집기 → 저장(확정) → 다시 "이대로 내보낼까요?" 예 / 아니요(계속 수정할게요).
// 1회용: 입력값·문서는 이 화면의 메모리에만 있다 — 쿠키·localStorage·서버 어디에도 저장하지 않고, 새로고침하면 사라진다.
// 파일(HWPX·DOCX·PDF)은 브라우저 안에서 만든다(이름·주소·금액이 서버로 가지 않는다). 서버에는 초안 도우미용 질문 번호만 보낸다.
import { useState } from "react";
import { AI_NOTICE } from "@/lib/api/respond";
import {
  buildFile,
  downloadFile,
  EXPORT_FORMATS,
  fetchFonts,
  type ExportFormat,
} from "@/lib/documents/export";
import type { Block } from "@/lib/documents/fill";
import { BIRTH_NOTICE } from "@/lib/documents/fields";
import {
  CHECK_NOTICE,
  DOCUMENT_NOTICE,
  DOCUMENT_SPECS,
  DRAFT_NOTICE,
  FACTS_FIELD,
  fillDocument,
  initialValues,
  parseDocumentInput,
  RRN_NOTICE,
  type DocumentInput,
} from "@/lib/documents/policy";
import type { DocumentKind } from "@/lib/procedure/steps";
import { DocumentEditor, DocumentPreview } from "./DocumentPaper";
import { Modal } from "./Modal";
import { SurveyDialog } from "./SurveyDialog";

type Phase = "intro" | "survey" | "confirm" | "edit" | "done";
type ExportState =
  { kind: "idle" } | { kind: "busy" } | { kind: "done"; filename: string } | { kind: "error" };
type DraftState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; aiUsed: boolean; notice: string | null; missing: string[]; filled: string[] }
  | { kind: "error"; message: string };

const NO_AI: Record<string, string> = {
  free_mode: "지금은 AI 문장 정리가 꺼져 있어 정해진 칸만 채웠어요.",
  daily_limit: "오늘 AI 정리 횟수를 다 써서 정해진 칸만 채웠어요.",
  cost_cap: "사연이 길어 AI 정리를 하지 못하고 정해진 칸만 채웠어요.",
  model_failed: "AI 정리를 하지 못해 정해진 칸만 채웠어요.",
  no_facts: "사연에서 옮겨 적을 사실을 찾지 못해 정해진 칸만 채웠어요.",
};

export function DocumentStudio({
  kind,
  inquiryId,
  draftEnabled,
  preview,
}: {
  kind: DocumentKind;
  /** 결과 화면에서 온 질문 번호 (초안 도우미) */
  inquiryId: string | null;
  /** 초안 도우미 API가 열려 있는지 (게이트 승인 시에만) */
  draftEnabled: boolean;
  /** 관리자 미리보기 (게이트는 꺼져 있음) */
  preview: boolean;
}) {
  const spec = DOCUMENT_SPECS[kind];
  const [phase, setPhase] = useState<Phase>("intro");
  const [values, setValues] = useState<DocumentInput>(() => initialValues(kind));
  const [page, setPage] = useState(0);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [editBlocks, setEditBlocks] = useState<Block[]>([]);
  const [edited, setEdited] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("hwpx");
  const [exported, setExported] = useState<ExportState>({ kind: "idle" });
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const meta = { title: spec.title, basename: fillDocument(kind, emptyInput(kind)).basename };
  const aiUsed = aiFields.size > 0;
  const hasDoc = blocks.length > 0;

  function complete() {
    try {
      const doc = fillDocument(kind, parseDocumentInput(kind, values));
      setBlocks(doc.blocks);
      setEdited(false);
      setExported({ kind: "idle" });
      setError(null);
      setPhase("confirm");
    } catch {
      setError("비어 있거나 형식이 맞지 않는 칸이 있어요. 설문을 다시 확인해 주세요.");
      setPhase("intro");
    }
  }

  async function exportNow() {
    setExported({ kind: "busy" });
    try {
      const file = await buildFile(format, blocks, meta, fetchFonts);
      downloadFile(file);
      setExported({ kind: "done", filename: file.filename });
      setPhase("done");
    } catch {
      setExported({ kind: "error" });
    }
  }

  function startEdit() {
    setEditBlocks(blocks.map((b) => ({ ...b })));
    setPhase("edit");
  }

  function saveEdit() {
    setBlocks(
      editBlocks.filter((b, i, all) => !(b.kind === "blank" && all[i - 1]?.kind === "blank")),
    );
    setEdited(true);
    setExported({ kind: "idle" });
    setPhase("confirm");
  }

  async function requestDraft() {
    if (!inquiryId) return;
    setDraft({ kind: "busy" });
    const res = await fetch(`/api/v1/documents/${kind}/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inquiryId }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok || !body?.data) {
      const code = body?.error?.code;
      setDraft({
        kind: "error",
        message:
          code === "FEATURE_GATED"
            ? "법률 검토 후 열릴 기능이에요."
            : code === "RATE_LIMITED"
              ? "요청이 많아요. 잠시 후 다시 시도해 주세요."
              : code === "FORBIDDEN" || code === "NOT_FOUND" || code === "INVALID_STATE"
                ? "이 질문으로는 초안을 만들 수 없어요. 칸을 직접 채워 주세요."
                : "초안을 만들지 못했어요. 칸을 직접 채워 주세요.",
      });
      return;
    }
    const data = body.data as {
      suggestions: Record<string, string>;
      missing: string[];
      ai: { used: boolean; reason?: string };
      notice: string | null;
    };
    // 사용자가 이미 적은 칸은 덮어쓰지 않는다
    const filled = Object.keys(data.suggestions).filter((k) => !values[k]?.trim());
    setValues((v) => {
      const next = { ...v };
      for (const k of filled) next[k] = data.suggestions[k];
      return next;
    });
    const factsKey = FACTS_FIELD[kind];
    if (factsKey && data.ai.used && filled.includes(factsKey)) {
      // 서버가 고지를 빠뜨려도 AI 문장에는 늘 AI_NOTICE를 붙인다 (절대 규칙 6)
      setAiNotice(data.notice ?? AI_NOTICE);
      setAiFields((s) => new Set(s).add(factsKey));
    }
    setDraft({
      kind: "done",
      aiUsed: data.ai.used,
      notice: data.ai.used
        ? (data.notice ?? AI_NOTICE)
        : data.ai.reason
          ? (NO_AI[data.ai.reason] ?? null)
          : null,
      missing: data.missing,
      filled,
    });
  }

  const draftPanel =
    inquiryId && draftEnabled && spec.draftFields ? (
      <DraftPanel
        draftFields={spec.draftFields}
        state={draft}
        onRequest={() => void requestDraft()}
      />
    ) : null;

  return (
    <section aria-label={`${spec.title} 작성`} className="mt-6">
      {preview && (
        <p className="rounded-card border-gold bg-honey text-label mb-3 border border-dashed px-4 py-2 text-[13px] font-semibold">
          관리자 미리보기 · 법률 검토 전이라 공개 화면에는 보이지 않아요
        </p>
      )}
      <p className="rounded-card border-line bg-cream text-ink border px-4 py-3 text-sm leading-relaxed">
        설문에 답하면 바로 문서가 완성돼요. 따로 프로그램을 설치하지 않아도 이 화면에서 보고 고친 뒤
        한글(HWPX)·워드(DOCX)·PDF로 내려받을 수 있어요. 입력한 내용은 이 화면에만 있고 어디에도
        저장되지 않아요(새로고침하면 사라져요).
      </p>
      {[RRN_NOTICE, BIRTH_NOTICE]
        .filter((n) => spec.pages.some((pg) => pg.help === n))
        .map((n) => (
          <p key={n} className="text-muted mt-2 text-[13px] leading-relaxed">
            {n}
          </p>
        ))}
      {spec.officialNotice && (
        <blockquote className="rounded-card border-note-line bg-note text-ink mt-3 border px-4 py-3 text-[13px] leading-relaxed">
          “{spec.officialNotice.text}”
          <span className="text-muted mt-1 block">출처: {spec.officialNotice.source}</span>
        </blockquote>
      )}

      {phase !== "edit" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPhase("survey")}
            className="rounded-button bg-ink min-h-11 px-5 text-[15px] font-semibold text-white"
          >
            {hasDoc ? "설문으로 돌아가 고치기" : page > 0 ? "이어서 작성하기" : "서식 작성 시작"}
          </button>
          {hasDoc && (
            <>
              <button
                type="button"
                onClick={startEdit}
                className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-[15px]"
              >
                직접 수정하기
              </button>
              <button
                type="button"
                onClick={() => setPhase("confirm")}
                className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-[15px]"
              >
                내보내기
              </button>
            </>
          )}
        </div>
      )}
      {hasDoc && phase !== "edit" && edited && (
        <p className="text-muted mt-2 text-[13px]">
          설문으로 돌아가 문서를 다시 완성하면, 직접 고친 내용은 새로 채운 문서로 바뀌어요.
        </p>
      )}
      {error && (
        <p role="alert" className="text-warn-text mt-3 text-sm">
          {error}
        </p>
      )}

      {hasDoc && (
        <div className="mt-5">
          <Notices aiUsed={aiUsed} aiNotice={aiNotice} />
          {phase === "edit" ? (
            <div className="mt-3">
              <DocumentEditor blocks={editBlocks} onChange={setEditBlocks} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  className="rounded-button bg-ink min-h-11 px-5 text-[15px] font-semibold text-white"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => setPhase(exported.kind === "done" ? "done" : "intro")}
                  className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-[15px]"
                >
                  고친 내용 버리기
                </button>
              </div>
              <p className="text-muted mt-2 text-[13px]">
                저장은 이 화면에서 내보낼 내용을 확정하는 것이고, 기기나 서버에 남지 않아요.
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <DocumentPreview blocks={blocks} />
            </div>
          )}
          {exported.kind === "done" && phase === "done" && (
            <p role="status" className="text-success-text mt-3 text-sm">
              {exported.filename} 파일을 내려받았어요.
            </p>
          )}
          <p className="text-muted mt-3 text-[13px] leading-relaxed">{CHECK_NOTICE}</p>
        </div>
      )}

      <SurveyDialog
        open={phase === "survey"}
        kind={kind}
        values={values}
        onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
        page={page}
        onPage={setPage}
        onComplete={complete}
        onClose={() => setPhase(hasDoc ? (exported.kind === "done" ? "done" : "intro") : "intro")}
        aiFields={aiFields}
        top={draftPanel}
      />

      <Modal
        open={phase === "confirm"}
        onClose={() => setPhase(exported.kind === "done" ? "done" : "intro")}
        label="내보내기 확인"
      >
        <div className="px-5 py-5">
          <h2 className="font-display text-[20px] font-bold">
            {edited ? "고친 내용을 저장했어요" : "입력하신 내용대로 문서를 완성했어요"}
          </h2>
          <p className="text-muted mt-1 text-sm leading-relaxed">
            이대로 내보내시겠어요? 내보내기 전에 화면에서 내용을 한 번 더 확인해 주세요.
          </p>
          <fieldset className="mt-4">
            <legend className="text-ink text-sm font-semibold">파일 형식</legend>
            <div className="mt-2 flex flex-col gap-2">
              {EXPORT_FORMATS.map((f) => (
                <label
                  key={f.value}
                  className={`rounded-button border-line flex min-h-11 cursor-pointer items-start gap-3 border px-3 py-2.5 ${format === f.value ? "border-ink bg-cream" : "bg-white"}`}
                >
                  <input
                    type="radio"
                    name="export-format"
                    checked={format === f.value}
                    onChange={() => setFormat(f.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-[15px] font-semibold">{f.label}</span>
                    <span className="text-muted block text-[13px]">{f.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {exported.kind === "error" && (
            <p role="alert" className="text-warn-text mt-3 text-sm">
              파일을 만들지 못했어요. 다른 형식을 고르거나 다시 시도해 주세요.
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="button"
              onClick={() => void exportNow()}
              disabled={exported.kind === "busy"}
              className="rounded-button bg-ink min-h-11 flex-1 px-5 text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {exported.kind === "busy" ? "파일을 만드는 중…" : "예, 내보낼게요"}
            </button>
            <button
              type="button"
              onClick={startEdit}
              className="rounded-button border-line text-ink min-h-11 flex-1 border bg-white px-4 text-[15px]"
            >
              {edited ? "아니요, 계속 수정할게요" : "아니요, 직접 수정할게요"}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

/** 칸을 모두 비운 입력 (파일 이름만 얻을 때) */
function emptyInput(kind: DocumentKind): DocumentInput {
  return Object.fromEntries(DOCUMENT_SPECS[kind].fields.map((f) => [f.key, ""]));
}

function Notices({ aiUsed, aiNotice }: { aiUsed: boolean; aiNotice: string | null }) {
  return (
    <p className="flex flex-wrap gap-1.5">
      {aiUsed ? (
        <>
          {aiNotice && (
            <span className="bg-ink rounded-[6px] px-2.5 py-1 text-xs font-semibold text-white">
              {aiNotice}
            </span>
          )}
          <span className="bg-cream text-label rounded-[6px] px-2.5 py-1 text-xs font-semibold">
            {DRAFT_NOTICE}
          </span>
        </>
      ) : (
        <span className="bg-ink rounded-[6px] px-2.5 py-1 text-xs font-semibold text-white">
          {DOCUMENT_NOTICE}
        </span>
      )}
    </p>
  );
}

function DraftPanel({
  draftFields,
  state,
  onRequest,
}: {
  draftFields: string;
  state: DraftState;
  onRequest: () => void;
}) {
  return (
    <div className="rounded-card border-line bg-soft mb-5 border px-4 py-4">
      <p className="text-ink text-[15px] font-semibold">질문 내용으로 초안 채우기</p>
      <p className="text-muted mt-1 text-[13px] leading-relaxed">
        남기신 질문(개인정보를 가린 문장)으로 {draftFields} 칸을 채워요. 이름·주소·금액은 직접 적어
        주세요. 비어 있는 칸만 채우고, 적어 둔 칸은 그대로 둬요.
      </p>
      <button
        type="button"
        onClick={onRequest}
        disabled={state.kind === "busy"}
        className="rounded-button bg-ink mt-3 min-h-11 px-5 text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {state.kind === "busy" ? "초안을 만드는 중…" : "초안 채우기"}
      </button>
      {state.kind === "error" && (
        <p role="alert" className="text-warn-text mt-2 text-sm">
          {state.message}
        </p>
      )}
      {state.kind === "done" && (
        <div role="status" className="mt-3 text-sm leading-relaxed">
          {state.aiUsed && (
            <p className="flex flex-wrap gap-1.5">
              <span className="bg-ink rounded-[6px] px-2 py-0.5 text-xs font-semibold text-white">
                {state.notice}
              </span>
              <span className="bg-cream text-label rounded-[6px] px-2 py-0.5 text-xs font-semibold">
                {DRAFT_NOTICE}
              </span>
            </p>
          )}
          {!state.aiUsed && state.notice && <p className="text-muted">{state.notice}</p>}
          {state.filled.length === 0 && (
            <p className="text-muted mt-1">채울 수 있는 빈 칸이 없었어요.</p>
          )}
          {state.missing.length > 0 && (
            <div className="mt-2">
              <p className="text-ink font-semibold">더 적으면 좋은 내용</p>
              <ul className="text-ink mt-1 list-disc pl-5">
                {state.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-muted mt-2 text-[13px]">
            채운 문장은 사실과 맞는지 꼭 확인하고 고쳐 쓰세요.
          </p>
        </div>
      )}
    </div>
  );
}
