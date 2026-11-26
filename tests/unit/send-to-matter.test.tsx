// DEC-075 ⓓ 보관함 → 사건 진행 노트: 자료 한 건 = 노트 한 건(법령·판례, AI 아님), 같은 출처는 다시 넣지 않음, 노트 한도.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MATTER_LIMITS, emptyMatter, type MatterData } from "@/lib/matters/model";
import type { RecentItem } from "@/components/search/recent";

const quota = vi.hoisted(() => ({ value: { anonymous: false } as { anonymous: boolean } }));
vi.mock("@/components/useQuota", () => ({ useQuota: () => quota.value }));
const m = vi.hoisted(() => ({ listMatters: vi.fn(), getMatter: vi.fn(), saveMatter: vi.fn() }));
vi.mock("@/lib/client/matters", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/matters")>()),
  listMatters: m.listMatters,
  getMatter: m.getMatter,
  saveMatter: m.saveMatter,
}));

const { appendShelfNotes, noteFromPin } = await import("@/components/search/to-matter");
const { SendToMatter } = await import("@/components/search/SendToMatter");

const pin = (href: string, memo?: string): RecentItem => ({
  href,
  title: `판례 ${href}`,
  sub: `대법원 2021. 3. 11. 선고 가상다${href.slice(-1)}`,
  kind: "판례",
  at: 1,
  ...(memo && { memo }),
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("노트 만들기 (순수)", () => {
  test("자료 한 건이 '법령·판례' 노트 한 건 — 인용 표기·메모·이 사이트 주소, AI 아님", () => {
    const n = noteFromPin(
      pin("/cases/1", "반환 시기"),
      "https://example.test",
      "2026-11-27T00:00:00Z",
    );
    expect(n).toMatchObject({
      title: "판례 /cases/1",
      kind: "search",
      byAi: false,
      refs: [],
      sources: [{ title: "판례 판례 /cases/1", url: "https://example.test/cases/1" }],
    });
    expect(n.body).toContain("대법원 2021. 3. 11. 선고 가상다1");
    expect(n.body).toContain("메모: 반환 시기");
    expect(noteFromPin(pin("/cases/1"), "file://x").sources).toEqual([]);
  });

  test("이미 보낸 주소는 건너뛰고, 노트 한도를 넘기지 않는다", () => {
    const base = emptyMatter();
    const once = appendShelfNotes(base, [pin("/cases/1"), pin("/cases/2")], "https://example.test");
    expect(once.added).toBe(2);
    const twice = appendShelfNotes(
      once.data,
      [pin("/cases/1"), pin("/cases/3")],
      "https://example.test",
    );
    expect([twice.added, twice.duplicate]).toEqual([1, 1]);
    const full: MatterData = {
      ...base,
      notes: Array.from({ length: MATTER_LIMITS.notes }, (_, i) =>
        noteFromPin(pin(`/x/${i}`), "https://example.test"),
      ),
    };
    const over = appendShelfNotes(full, [pin("/cases/9")], "https://example.test");
    expect([over.added, over.overLimit]).toEqual([0, 1]);
  });
});

describe("사건 노트로 보내기 칸", () => {
  test("로그인 전에는 안내만 보이고 사건을 불러오지 않는다", () => {
    quota.value = { anonymous: true };
    render(<SendToMatter items={[pin("/cases/1")]} scope="전체" />);
    expect(screen.getByText(/로그인하면/)).toBeDefined();
    expect(m.listMatters).not.toHaveBeenCalled();
  });

  test("사건을 고르고 보내면 노트를 더해 저장하고 사건 열기 링크를 보인다", async () => {
    quota.value = { anonymous: false };
    m.listMatters.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "m1",
            title: "보증금 사건",
            updatedAt: "",
            counts: { docs: 0, parties: 0, issues: 0, notes: 0 },
          },
        ],
      },
    });
    m.getMatter.mockResolvedValue({
      ok: true,
      data: { id: "m1", title: "보증금 사건", updatedAt: "", data: emptyMatter() },
    });
    m.saveMatter.mockResolvedValue({ ok: true, data: { id: "m1", updatedAt: "" } });
    render(<SendToMatter items={[pin("/cases/1", "메모")]} scope="전체" />);
    fireEvent.change(await screen.findByLabelText("보낼 사건"), { target: { value: "m1" } });
    fireEvent.click(screen.getByRole("button", { name: /1건 노트로 보내기/ }));
    expect(await screen.findByText(/노트 1건을 붙였어요/)).toBeDefined();
    const saved = m.saveMatter.mock.calls[0][1].data as MatterData;
    expect(saved.notes).toHaveLength(1);
    expect(saved.notes[0].byAi).toBe(false);
    expect(screen.getByRole("link", { name: "사건 열기 →" }).getAttribute("href")).toBe(
      "/matters?open=m1",
    );
  });
});
