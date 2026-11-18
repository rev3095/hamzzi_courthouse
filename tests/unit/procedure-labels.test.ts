// @vitest-environment node
// DEC-037 AI 절차 분류 라벨 — 규칙 → 저장된 라벨 → (유료일 때만) Haiku 분류 1회 → 저장. 모델·DB는 가짜.
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import {
  UNDECIDED_TITLE,
  cleanKeywords,
  hintOf,
  immediateHint,
  isCleanText,
  labelFromClassification,
  matchLabel,
  parseHint,
  type LabelStep,
  type ProcedureLabel,
} from "@/lib/procedure/labels";
import { hasTimeline, procedurePlan } from "@/lib/procedure/policy";

vi.mock("server-only", () => ({}));
const labelStore = vi.hoisted(() => ({
  activeLabels: vi.fn(),
  bumpLabel: vi.fn(),
  insertLabel: vi.fn(),
}));
vi.mock("@/lib/procedure/labels-store", () => labelStore);
const classify = vi.hoisted(() => ({ classifyProcedure: vi.fn() }));
vi.mock("@/lib/ai/classify", () => classify);
const rate = vi.hoisted(() => ({ tryAiQuota: vi.fn(async () => true) }));
vi.mock("@/lib/auth/rate-limit", () => rate);

const { procedureHintFor } = await import("@/lib/inquiries/procedure-hint");

const STEPS: LabelStep[] = [
  { label: "처분 내용 확인", difficulty: "self", prepare: ["받은 처분서"], cautions: [] },
  {
    label: "특허심판 청구",
    difficulty: "depends",
    prepare: ["청구서", "증거 자료"],
    cautions: ["청구할 수 있는 기간이 정해져 있어요"],
  },
];
// 규칙(lib/procedure/policy)에 타임라인이 없는 분야의 질문이어야 한다
const Q = "출원이 거절 결정을 받았는데 특허심판을 하고 싶어요";

const label = (over: Partial<ProcedureLabel>): ProcedureLabel => ({
  id: "l-1",
  title: "특허심판 청구 절차",
  keywords: ["특허심판"],
  track: null,
  steps: STEPS,
  status: "approved",
  hits: 0,
  createdAt: "2026-11-19T00:00:00Z",
  ...over,
});

const result = (over: Partial<DemoAnalysisResult> = {}) =>
  ({
    intent: { area: "", goal: "", laws: [], lawKeywords: [], precKeywords: [] },
    articles: [],
    mode: "ai",
    ...over,
  }) as unknown as DemoAnalysisResult;

describe("DEC-037 AI 문구 검사 (절대 규칙 1·2·3·4)", () => {
  test("숫자·단정 표현·개인정보 패턴이 있으면 버린다", () => {
    expect(isCleanText("청구서를 준비해요", 80)).toBe(true);
    expect(isCleanText("90일 안에 청구해요", 80)).toBe(false);
    expect(isCleanText("제27조에 따라 청구해요", 80)).toBe(false);
    expect(isCleanText("반드시 이길 수 있어요", 80)).toBe(false);
    expect(isCleanText("승소 가능성이 높아요", 80)).toBe(false);
    expect(isCleanText("010-1234-5678로 연락해요", 80)).toBe(false);
    expect(isCleanText("가".repeat(81), 80)).toBe(false);
    // 한글로 쓴 숫자 + 단위도 숫자다 (절대 규칙 3)
    for (const t of [
      "삼 개월 안에 청구해요",
      "십사 일 안에 내요",
      "석 달이 지나면 안 돼요",
      "일주일 안에 답해요",
      "보름 안에 신청해요",
      "두 번까지 낼 수 있어요",
    ]) {
      expect(isCleanText(t, 80), t).toBe(false);
    }
    // 근거와 대조하지 않은 법령 언급·그 밖의 단정 표현
    for (const t of [
      "행정심판법에 따라 청구해요",
      "시행령을 확인해요",
      "꼭 받을 수 있어요",
      "항상 인정됩니다",
    ]) {
      expect(isCleanText(t, 80), t).toBe(false);
    }
    // 흔한 낱말은 숫자로 잘못 보지 않는다
    for (const t of [
      "신청 방법에 따라 준비해요",
      "이의가 있으면 다시 신청해요",
      "만일을 대비해 사본을 남겨요",
    ]) {
      expect(isCleanText(t, 80), t).toBe(true);
    }
  });

  test("낱말은 질문에 실제로 있고 흔한 낱말이 아니어야 한다", () => {
    expect(cleanKeywords(["특허심판", "출원", "문제", "과태료", "홍길동1"], Q)).toEqual([
      "특허심판",
      "출원",
    ]);
  });
});

describe("DEC-037 분류 결과 → 라벨", () => {
  test("기존 타임라인을 고른 라벨도 pending으로 저장한다 — 그 질문 한 건에만 바로 보인다", () => {
    const l = labelFromClassification(
      { track: "neighbor", keywords: ["층간소음"], proposal: null },
      "윗집 층간소음이 너무 심해요",
    );
    expect(l).toMatchObject({ track: "neighbor", steps: null, status: "pending" });
    expect(immediateHint(l!)).toEqual({ kind: "track", track: "neighbor" });
    // 다른 사람의 질문에는 승인 전까지 쓰이지 않는다
    expect(hintOf(label({ ...l!, status: "pending" }))).toBeNull();
  });

  test("새 단계 초안은 pending — 운영자 승인 전에는 화면에 나가지 않는다", () => {
    const l = labelFromClassification(
      {
        track: "none",
        keywords: ["특허심판"],
        proposal: { title: "특허심판 청구 절차", steps: STEPS },
      },
      Q,
    );
    expect(l).toMatchObject({ track: null, status: "pending", title: "특허심판 청구 절차" });
    expect(hintOf(label({ ...l!, status: "pending" }))).toBeNull();
    // AI가 새로 쓴 단계는 그 질문에도 승인 전에는 보이지 않는다
    expect(immediateHint(l!)).toBeNull();
  });

  test("초안에 숫자가 있으면 '절차 미정'으로만 남긴다 (같은 낱말에 모델을 다시 부르지 않게)", () => {
    const bad = [{ ...STEPS[0], cautions: ["90일 안에 내야 해요"] }, STEPS[1]];
    const l = labelFromClassification(
      { track: "none", keywords: ["특허심판"], proposal: { title: "특허심판 절차", steps: bad } },
      Q,
    );
    expect(l).toMatchObject({ title: UNDECIDED_TITLE, steps: [], status: "pending" });
    expect(hintOf(label({ ...l!, status: "approved" }))).toBeNull();
  });

  test("쓸 수 있는 낱말이 없으면 저장하지 않는다", () => {
    expect(
      labelFromClassification(
        { track: "neighbor", keywords: ["문제", "없는낱말"], proposal: null },
        Q,
      ),
    ).toBeNull();
  });
});

describe("DEC-037 저장된 라벨 찾기·화면 값", () => {
  test("질문에 낱말이 있는 라벨을 찾고, 거절된 라벨은 보지 않는다", () => {
    expect(matchLabel([label({})], Q)?.id).toBe("l-1");
    expect(matchLabel([label({ status: "rejected" })], Q)).toBeNull();
    expect(matchLabel([label({ keywords: ["상속"] })], Q)).toBeNull();
  });

  test("화면 값은 형식·문구 검사를 다시 통과해야 한다", () => {
    expect(parseHint({ kind: "track", track: "neighbor" })).toEqual({
      kind: "track",
      track: "neighbor",
    });
    expect(parseHint({ kind: "track", track: "없는절차" })).toBeNull();
    expect(parseHint({ kind: "custom", title: "특허심판 청구 절차", steps: STEPS })?.kind).toBe(
      "custom",
    );
    expect(parseHint({ kind: "custom", title: "100% 이기는 절차", steps: STEPS })).toBeNull();
  });

  test("규칙이 정하지 못했을 때만 라벨의 타임라인을 보인다", () => {
    const hinted = result({
      procedureHint: { kind: "custom", title: "특허심판 청구 절차", steps: STEPS },
    });
    const plan = procedurePlan(hinted, Q);
    expect(plan.kind).toBe("custom_timeline");
    // AI가 정한 안내는 화면이 AI 고지를 붙일 수 있게 표시한다 (절대 규칙 6)
    expect(hasTimeline(plan) && plan.byAi).toBe(true);
    expect(hasTimeline(plan) && plan.steps.map((s) => s.label)).toEqual([
      "처분 내용 확인",
      "특허심판 청구",
    ]);
    // 규칙이 정한 사건(임금)은 라벨이 있어도 규칙이 먼저다
    const wage = procedurePlan(
      result({ procedureHint: { kind: "track", track: "neighbor" } }),
      "월급을 못 받았어요",
    );
    expect(wage.caseType).toBe("wage");
    expect(hasTimeline(wage) && wage.byAi).toBe(false);
    // 수사를 받는 쪽은 규칙이 정한 받는 쪽 타임라인 그대로다 — 라벨로 바뀌지 않는다
    const accused = procedurePlan(
      result({ procedureHint: { kind: "track", track: "neighbor" } }),
      "제가 고소를 당했어요",
    );
    expect(accused.caseType).toBe("respond_criminal");
    expect(hasTimeline(accused) && accused.byAi).toBe(false);
  });

  test("기존 타임라인을 가리키는 라벨은 그 타임라인을 그대로 보인다", () => {
    const plan = procedurePlan(result({ procedureHint: { kind: "track", track: "neighbor" } }), Q);
    expect(plan.caseType).toBe("neighbor");
    expect(hasTimeline(plan) && plan.byAi).toBe(true);
  });
});

describe("DEC-037 분류 순서 — 같은 일을 두 번 하지 않는다", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rate.tryAiQuota.mockResolvedValue(true);
    labelStore.activeLabels.mockResolvedValue([]);
    labelStore.insertLabel.mockImplementation(async (l) => label({ ...l, id: "new" }));
  });

  test("규칙이 절차를 정하면 표도 모델도 보지 않는다", async () => {
    const out = await procedureHintFor(result(), "월급을 못 받았어요", { allowAi: true });
    expect(out).toBeUndefined();
    expect(labelStore.activeLabels).not.toHaveBeenCalled();
    expect(classify.classifyProcedure).not.toHaveBeenCalled();
  });

  test("저장된 라벨이 있으면 모델을 부르지 않는다 (승인 전 라벨도 호출은 막는다)", async () => {
    labelStore.activeLabels.mockResolvedValue([label({ status: "pending" })]);
    expect(await procedureHintFor(result(), Q, { allowAi: true })).toBeUndefined();
    expect(classify.classifyProcedure).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
    expect(labelStore.bumpLabel).toHaveBeenCalledWith("l-1");

    labelStore.activeLabels.mockResolvedValue([label({})]);
    expect(await procedureHintFor(result(), Q, { allowAi: true })).toMatchObject({
      kind: "custom",
    });
    expect(classify.classifyProcedure).not.toHaveBeenCalled();
  });

  test("라벨이 없고 유료 모드면 Haiku 분류 1회(예산 1단위) 후 저장한다", async () => {
    classify.classifyProcedure.mockResolvedValue({
      ok: true,
      costUsd: 0.0003,
      output: { track: "neighbor", keywords: ["특허심판"], proposal: null },
    });
    const out = await procedureHintFor(result(), Q, { allowAi: true });
    expect(rate.tryAiQuota).toHaveBeenCalledWith(1);
    expect(classify.classifyProcedure).toHaveBeenCalledTimes(1);
    expect(labelStore.insertLabel).toHaveBeenCalledWith(
      expect.objectContaining({ track: "neighbor", keywords: ["특허심판"], status: "pending" }),
    );
    expect(out).toEqual({ kind: "track", track: "neighbor" });
  });

  test("무료 모드·주간 예산 초과면 모델을 부르지 않는다", async () => {
    await procedureHintFor(result(), Q, { allowAi: false });
    rate.tryAiQuota.mockResolvedValue(false);
    await procedureHintFor(result(), Q, { allowAi: true });
    expect(classify.classifyProcedure).not.toHaveBeenCalled();
  });

  test("분류·저장이 실패해도 분석을 막지 않는다", async () => {
    classify.classifyProcedure.mockResolvedValue({ ok: false, reason: "model", costUsd: 0 });
    expect(await procedureHintFor(result(), Q, { allowAi: true })).toBeUndefined();
    labelStore.activeLabels.mockRejectedValue(new Error("db"));
    expect(await procedureHintFor(result(), Q, { allowAi: true })).toBeUndefined();
  });
});
