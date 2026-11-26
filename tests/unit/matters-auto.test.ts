// @vitest-environment node
// DEC-073 사건 자동 정리 — POST /api/v1/matters/auto 와 거르기 규칙. 저장소·모델은 모두 가짜다 (절대 규칙 8). 이름은 가상이다.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MATTER_SUMMARY_WEIGHT } from "@/lib/ai/models";
import { AI_NOTICE } from "@/lib/api/respond";
import {
  autoSig,
  autoStale,
  composeAutoText,
  emptyMatter,
  type MatterData,
} from "@/lib/matters/model";
import { parseMatterData, screenAuto } from "@/lib/matters/policy";

vi.mock("server-only", () => ({}));
const store = vi.hoisted(() => ({
  requireMatterUser: vi.fn(),
  getMatter: vi.fn(),
  saveMatterAuto: vi.fn(),
  createMatter: vi.fn(),
  listMatters: vi.fn(),
}));
vi.mock("@/lib/matters/store", () => store);
const rate = vi.hoisted(() => ({
  assertRateLimit: vi.fn(),
  assertUserRate: vi.fn(),
  tryAiQuota: vi.fn(),
  settleAiQuota: vi.fn(),
}));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  ...rate,
}));
const mode = vi.hoisted(() => ({ aiMode: vi.fn() }));
vi.mock("@/lib/ai/mode", () => mode);
const ai = vi.hoisted(() => ({ autoNameMatter: vi.fn() }));
vi.mock("@/lib/ai/matter", () => ai);

const { POST: auto } = await import("@/app/api/v1/matters/auto/route");
const { POST: create } = await import("@/app/api/v1/matters/route");
const { MATTER_AUTO_RATE } = await import("@/lib/auth/rate-limit");

const ID = "11111111-2222-4333-8444-555555555555";
const req = (body: unknown) =>
  new Request("http://localhost/api/v1/matters/auto", {
    method: "POST",
    body: JSON.stringify(body),
  });

const withFacts = (extra: Partial<MatterData> = {}): MatterData => ({
  ...emptyMatter(),
  parties: [
    { id: "p1", name: "김가상", kind: "person", side: "claimant", role: "임대인", note: "" },
  ],
  facts: [{ id: "f1", when: "2026-10-01", what: "김가상이 보증금 반환을 미뤘다", docId: null }],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  store.requireMatterUser.mockResolvedValue({ userId: "u-1", admin: false });
  store.getMatter.mockResolvedValue({
    id: ID,
    title: "새 사건",
    updatedAt: "t1",
    data: withFacts({ titleAuto: true }),
  });
  store.saveMatterAuto.mockResolvedValue(true);
  rate.assertRateLimit.mockResolvedValue(undefined);
  rate.tryAiQuota.mockResolvedValue(true);
  rate.settleAiQuota.mockResolvedValue(undefined);
  mode.aiMode.mockReturnValue("paid");
  ai.autoNameMatter.mockResolvedValue({
    ok: true,
    title: "전세 보증금 반환 요구",
    field: "lease",
    gist: "임대인이 보증금 반환을 미루고 있는 일",
    costUsd: 0.0007,
  });
});

describe("DEC-073 자동 정리 경로", () => {
  test("이름을 가린 글만 Haiku 경로로 보내고, 제목·분야·요약을 고친 시각 조건으로 저장한다", async () => {
    const res = await auto(req({ matterId: ID }), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const sent = ai.autoNameMatter.mock.calls[0][0] as string;
    expect(sent).not.toContain("김가상");
    expect(rate.tryAiQuota).toHaveBeenCalledWith(MATTER_SUMMARY_WEIGHT);
    expect(rate.settleAiQuota).toHaveBeenCalledWith(MATTER_SUMMARY_WEIGHT, 0.0007);
    // 하루 횟수는 다른 사건 AI 기능과 따로 센다
    expect(rate.assertUserRate).toHaveBeenCalledWith(MATTER_AUTO_RATE, "u-1");
    const saved = store.saveMatterAuto.mock.calls[0];
    expect(saved[0]).toBe("u-1");
    expect(saved[2].title).toBe("전세 보증금 반환 요구");
    expect(saved[2].updatedAt).toBe("t1");
    expect(saved[2].data.auto).toMatchObject({ field: "lease", sig: autoSig(withFacts()) });
    const body = (await res.json()) as { data: { notice: string; ai: { used: boolean } } };
    expect(body.data.ai.used).toBe(true);
    expect(body.data.notice).toBe(AI_NOTICE);
  });

  test("사용자가 이름을 적은 사건은 제목을 바꾸지 않는다", async () => {
    store.getMatter.mockResolvedValue({
      id: ID,
      title: "내가 지은 이름",
      updatedAt: "t1",
      data: withFacts(),
    });
    await auto(req({ matterId: ID }), undefined);
    expect(store.saveMatterAuto.mock.calls[0][2].title).toBe("내가 지은 이름");
  });

  test("자료가 그대로이거나 비었거나 무료 모드면 모델을 부르지 않는다", async () => {
    const d = withFacts();
    store.getMatter.mockResolvedValueOnce({
      id: ID,
      title: "x",
      updatedAt: "t1",
      data: { ...d, auto: { field: "lease", gist: "g", sig: autoSig(d), at: "t" } },
    });
    await auto(req({ matterId: ID }), undefined);
    store.getMatter.mockResolvedValueOnce({
      id: ID,
      title: "x",
      updatedAt: "t1",
      data: emptyMatter(),
    });
    await auto(req({ matterId: ID }), undefined);
    mode.aiMode.mockReturnValue("free");
    await auto(req({ matterId: ID }), undefined);
    expect(ai.autoNameMatter).not.toHaveBeenCalled();
    expect(store.saveMatterAuto).not.toHaveBeenCalled();
  });

  test("민감정보로 보이는 자료는 동의 화면이 없는 자동 경로라 보내지 않는다", async () => {
    store.getMatter.mockResolvedValue({
      id: ID,
      title: "x",
      updatedAt: "t1",
      data: withFacts({ summary: "우울증 진단을 받은 뒤 회사에서 해고 통보를 받음" }),
    });
    const res = await auto(req({ matterId: ID }), undefined);
    const body = (await res.json()) as { data: { ai: { reason: string } } };
    expect(body.data.ai.reason).toBe("sensitive");
    expect(ai.autoNameMatter).not.toHaveBeenCalled();
  });

  test("이름을 비워 만든 사건은 '새 사건'이고 자동 정리가 제목을 짓는다", async () => {
    store.createMatter.mockImplementation(async (_u: string, title: string, data: unknown) => ({
      id: ID,
      title,
      updatedAt: "t",
      data,
    }));
    const res = await create(
      new Request("http://localhost/api/v1/matters", {
        method: "POST",
        body: JSON.stringify({ title: "  " }),
      }),
      undefined,
    );
    expect(res.status).toBe(201);
    expect(store.createMatter.mock.calls[0][1]).toBe("새 사건");
    expect(store.createMatter.mock.calls[0][2].titleAuto).toBe(true);
  });

  test("모델이 실패하면 그 자료 지문을 남겨 같은 자료로 다시 부르지 않는다", async () => {
    ai.autoNameMatter.mockResolvedValue({ ok: false, reason: "model_failed", costUsd: 0.0005 });
    await auto(req({ matterId: ID }), undefined);
    const saved = store.saveMatterAuto.mock.calls[0][2];
    expect(saved.data.autoFailedSig).toBe(autoSig(withFacts()));
    expect(saved.data.auto).toBeUndefined();
    expect(autoStale(saved.data)).toBe(false);
  });

  test("사건 번호 꼴이 아니면 400", async () => {
    const res = await auto(req({ matterId: "../x" }), undefined);
    expect(res.status).toBe(400);
  });
});

describe("DEC-073 자동 정리 거르기 (절대 규칙 1·2·4)", () => {
  test("판정·단정·조문·가림 표시가 든 제목·요약은 버리고, 목록 밖 분야는 기타", () => {
    expect(
      screenAuto({ title: "임대인이 반드시 이기는 사건", field: "lease", gist: "x" }).title,
    ).toBe("");
    expect(screenAuto({ title: "[이름1]과의 대금 분쟁", field: "money", gist: "" }).title).toBe("");
    expect(
      screenAuto({
        title: "보증금 반환",
        field: "lease",
        gist: "주택임대차보호법 제3조에 따른 대항력 문제",
      }).gist,
    ).toBe("");
    expect(
      screenAuto({
        title: "보증금 반환",
        field: "lease",
        gist: "임차인에게 유리한 사정이 많은 사건",
      }).gist,
    ).toBe("");
    expect(screenAuto({ title: "보증금 반환", field: "없는분야", gist: "" }).field).toBe("other");
    expect(
      screenAuto({
        title: "“보증금 반환 요구”",
        field: "lease",
        gist: "임대인이 보증금 반환을 미루는 일",
      }),
    ).toEqual({
      title: "보증금 반환 요구",
      field: "lease",
      gist: "임대인이 보증금 반환을 미루는 일",
    });
  });

  test("요약·제목의 숫자는 보낸 자료에 있을 때만", () => {
    const src = "사실: 2026-10-01 보증금 반환을 미뤘다";
    expect(
      screenAuto(
        { title: "보증금 반환", field: "lease", gist: "보증금 3,000만 원을 돌려받지 못한 일" },
        src,
      ).gist,
    ).toBe("");
    expect(
      screenAuto(
        { title: "보증금 반환", field: "lease", gist: "2026-10-01부터 보증금 반환이 미뤄진 일" },
        src,
      ).gist,
    ).not.toBe("");
  });

  test("숫자는 낱말 단위로, 한글 수사도 자료에 있는 것만", () => {
    const src = "사실: 2026-10-01 보증금 반환을 미뤘다";
    expect(
      screenAuto(
        { title: "보증금 반환", field: "lease", gist: "보증금 반환이 10일 미뤄진 일" },
        src,
      ).gist,
    ).toBe("");
    expect(
      screenAuto(
        { title: "보증금 반환", field: "lease", gist: "보증금 반환이 두 달 미뤄진 일" },
        src,
      ).gist,
    ).toBe("");
  });

  test("저장 때 브라우저가 보낸 자동 정리도 다시 거른다", () => {
    const d = withFacts({
      auto: { field: "lease", gist: "임차인이 반드시 이기는 사건", sig: "x", at: "t" },
    });
    expect(parseMatterData(d).auto).toBeUndefined();
    const ok = withFacts({
      auto: { field: "lease", gist: "보증금 반환이 미뤄진 일", sig: "x", at: "t" },
    });
    expect(parseMatterData(ok).auto?.gist).toBe("보증금 반환이 미뤄진 일");
  });

  test("지문은 글자 하나 고칠 때가 아니라 자료가 늘 때 바뀐다", () => {
    const a = withFacts();
    const typo = { ...a, facts: [{ ...a.facts[0], what: "보증금 반환을 미뤘음" }] };
    expect(autoSig(typo)).toBe(autoSig(a));
    const more = {
      ...a,
      facts: [...a.facts, { id: "f2", when: "", what: "내용증명", docId: null }],
    };
    expect(autoSig(more)).not.toBe(autoSig(a));
    expect(autoStale(emptyMatter())).toBe(false);
    expect(autoStale(a)).toBe(true);
    expect(composeAutoText(a)).toContain("사실: 2026-10-01");
  });
});
