// DEC-074 법령 탭: 국내·해외 통합 검색 화면 — 국기·나라 필터, 핵심 법령 처음 화면. 검색 API는 목으로 바꾼다.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CATALOG } from "@/lib/search/world/catalog";
import { COUNTRIES, WORLD_NOTICE, type WorldLawHit } from "@/lib/search/world/types";

const api = vi.hoisted(() => ({ searchWorldLaws: vi.fn(), searchCases: vi.fn() }));
vi.mock("@/lib/client/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/api")>()),
  // DEC-076 물어보기 AI 답은 이 화면 테스트에서 끝나지 않은 채로 둔다 (목록만 본다)
  getSearchAnswer: () => new Promise(() => {}),
  searchWorldLaws: api.searchWorldLaws,
  searchCases: api.searchCases,
}));

const { SearchView } = await import("@/components/search/SearchView");
const { WORLD_EXAMPLES } = await import("@/components/search/WorldLaws");
const { Flag } = await import("@/components/search/Flag");

const KR: WorldLawHit = {
  id: "kr:의료기기법",
  country: "kr",
  title: "의료기기법",
  kind: "법률",
  snippet: "의료기기의 제조·수입·판매와 취급 전반을 다루는 기본 법률이에요.",
  date: "2026-07-01",
  sourceUrl:
    "https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9D%98%EB%A3%8C%EA%B8%B0%EA%B8%B0%EB%B2%95",
  source: "법제처 국가법령정보센터",
  internal: "/laws/%EC%9D%98%EB%A3%8C%EA%B8%B0%EA%B8%B0%EB%B2%95",
  curated: true,
};
const US: WorldLawHit = {
  id: "us:21cfr-part-806",
  country: "us",
  title: "Medical Devices; Reports of Corrections and Removals",
  titleKo: "시정·회수 보고",
  kind: "연방규정",
  citation: "21 CFR Part 806",
  snippet: "의료기기를 고치거나 거두어들일 때의 보고에 관한 연방규정이에요.",
  sourceUrl: "https://www.ecfr.gov/current/title-21/part-806",
  source: "eCFR (미국 연방규정집)",
  curated: true,
};
const US_LIVE: WorldLawHit = {
  id: "us:21cfr-810.13",
  country: "us",
  title: "Mandatory recall order.",
  kind: "연방규정 조문",
  citation: "21 CFR 810.13",
  date: "2016-12-30",
  sourceUrl: "https://www.ecfr.gov/current/title-21/section-810.13",
  source: "eCFR (미국 연방규정집)",
};
const UK: WorldLawHit = {
  id: "uk:ukpga/2021/3",
  country: "uk",
  title: "Medicines and Medical Devices Act 2021",
  kind: "법률",
  citation: "2021 c. 3",
  sourceUrl: "https://www.legislation.gov.uk/ukpga/2021/3",
  source: "legislation.gov.uk (영국 국립기록원)",
};

const found = (over: Record<string, unknown> = {}) => ({
  ok: true,
  data: {
    items: [KR, US, US_LIVE, UK],
    failed: ["jp"],
    translated: { en: "medical device recall", ja: "医療機器 回収" },
    notice: WORLD_NOTICE,
    outcome: "grounded",
    ...over,
  },
});

const openLawTab = () => fireEvent.click(screen.getByRole("tab", { name: "법령" }));
const search = (q: string) => {
  fireEvent.change(screen.getByRole("textbox", { name: "법령 검색어" }), { target: { value: q } });
  fireEvent.submit(screen.getByRole("textbox", { name: "법령 검색어" }).closest("form")!);
};
const cards = () => within(screen.getByTestId("world-list")).getAllByRole("listitem");
const chip = (name: RegExp) =>
  within(screen.getByRole("group", { name: "나라 고르기" })).getByRole("button", { name });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

test("DEC-074 법령 탭 처음 화면: 의료기기 핵심 법령을 국내·해외 나라별로 국기와 함께 보인다", () => {
  render(<SearchView />);
  openLawTab();
  const panel = screen.getByRole("region", { name: "의료기기 법령 한눈에" });
  expect(within(panel).getByRole("heading", { name: "국내" })).toBeDefined();
  expect(within(panel).getByRole("heading", { name: "해외" })).toBeDefined();
  for (const c of ["kr", "us", "eu", "jp", "uk", "ca", "au", "cn"] as const) {
    const group = within(panel).getByRole("region", { name: `${COUNTRIES[c].name} 핵심 법령` });
    expect(within(group).getAllByRole("listitem")).toHaveLength(
      CATALOG.filter((e) => e.country === c).length,
    );
    expect(group.querySelector(`svg[data-flag="${c}"]`)).not.toBeNull();
  }
  expect(within(panel).getByText(WORLD_NOTICE)).toBeDefined();
  expect(api.searchWorldLaws).not.toHaveBeenCalled();
  // 글자 그대로의 퍼센트 기호·단정 표현은 화면에 없다
  expect(panel.textContent).not.toMatch(/%|반드시|무조건/);
});

test("DEC-074 예시 검색어를 누르면 바로 통합 검색한다", async () => {
  api.searchWorldLaws.mockResolvedValue(found());
  render(<SearchView />);
  openLawTab();
  fireEvent.click(screen.getByRole("button", { name: WORLD_EXAMPLES[1] }));
  expect(api.searchWorldLaws).toHaveBeenCalledWith(WORLD_EXAMPLES[1]);
  expect((await screen.findByTestId("result-count")).textContent).toBe("4건");
});

test("DEC-074 한 목록에 국내·해외를 함께 보이고, 카드마다 국기·나라 이름·출처·원문 링크가 있다", async () => {
  api.searchWorldLaws.mockResolvedValue(found());
  render(<SearchView />);
  openLawTab();
  search("의료기기 리콜");
  await screen.findByTestId("world-list");
  expect(cards()).toHaveLength(4);
  expect(screen.getByText(WORLD_NOTICE)).toBeDefined();

  const kr = cards()[0];
  expect(kr.querySelector('svg[data-flag="kr"]')!.getAttribute("aria-hidden")).toBe("true");
  expect(within(kr).getByText("대한민국")).toBeDefined();
  expect(within(kr).getByText("핵심 법령")).toBeDefined();
  expect(within(kr).getByText("법률 · 2026.07.01")).toBeDefined();
  expect(within(kr).getByRole("link", { name: "쉬운 설명 보기 →" }).getAttribute("href")).toBe(
    KR.internal,
  );

  const us = cards()[1];
  expect(within(us).getByText("미국")).toBeDefined();
  // 한국어 이름을 크게, 원어 제목을 그 아래에
  expect(within(us).getByText("시정·회수 보고").closest("p")!.className).toMatch(/text-\[19px\]/);
  expect(within(us).getByText(US.title).getAttribute("lang")).toBe("en");
  expect(within(us).getByText("연방규정 · 21 CFR Part 806")).toBeDefined();
  expect(within(us).getByText("출처 · eCFR (미국 연방규정집)")).toBeDefined();
  expect(within(us).queryByRole("link", { name: /쉬운 설명/ })).toBeNull();
  const original = within(us).getByRole("link", { name: "공식 원문 보기 ↗" });
  expect(original.getAttribute("href")).toBe(US.sourceUrl);
  expect(original.getAttribute("target")).toBe("_blank");
  expect(original.getAttribute("rel")).toContain("noopener");

  // 직접 고르지 않은 줄에는 '핵심 법령' 표시가 없다
  expect(within(cards()[2]).queryByText("핵심 법령")).toBeNull();
  expect(screen.queryByText(/유사도|관련도|승소|유리|불리/)).toBeNull();
});

test("DEC-074 전체·국내·해외·나라별로 걸러 보고, 건수는 숫자로만 적는다", async () => {
  api.searchWorldLaws.mockResolvedValue(found());
  render(<SearchView />);
  openLawTab();
  search("의료기기 리콜");
  await screen.findByTestId("world-list");

  expect(chip(/^전체/).textContent).toBe("전체 4");
  expect(chip(/^국내/).textContent).toBe("국내 1");
  expect(chip(/^해외/).textContent).toBe("해외 3");
  expect(chip(/^미국/).textContent).toBe("미국 2");
  expect(chip(/^미국/).querySelector('svg[data-flag="us"]')).not.toBeNull();
  // 결과에 없는 나라는 고르는 단추가 없다
  expect(
    within(screen.getByRole("group", { name: "나라 고르기" })).queryByRole("button", {
      name: /일본|유럽연합/,
    }),
  ).toBeNull();
  expect(chip(/^전체/).getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(chip(/^해외/));
  expect(cards().map((c) => c.getAttribute("data-country"))).toEqual(["us", "us", "uk"]);
  fireEvent.click(chip(/^국내/));
  expect(cards().map((c) => c.getAttribute("data-country"))).toEqual(["kr"]);
  fireEvent.click(chip(/^영국/));
  expect(cards().map((c) => c.getAttribute("data-country"))).toEqual(["uk"]);
  expect(chip(/^영국/).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(chip(/^전체/));
  expect(cards()).toHaveLength(4);
});

test("DEC-074 바꿔 보낸 검색어와 불러오지 못한 나라를 그대로 알린다", async () => {
  api.searchWorldLaws.mockResolvedValue(found({ failed: ["jp", "au"] }));
  render(<SearchView />);
  openLawTab();
  search("의료기기 리콜");
  expect((await screen.findByTestId("world-translated")).textContent).toBe(
    "해외 자료는 이렇게 찾았어요: medical device recall · 医療機器 回収",
  );
  expect(screen.getByRole("status").textContent).toMatch(
    /^일본·호주 자료는 지금 불러오지 못했어요/,
  );
});

test("DEC-074 결과가 없으면 다른 말로 찾아보게 예시를 보인다", async () => {
  api.searchWorldLaws.mockResolvedValue(
    found({ items: [], failed: [], translated: {}, outcome: "no_result_in_scope" }),
  );
  render(<SearchView />);
  openLawTab();
  search("없는말");
  expect(await screen.findByText(/로 찾은 법령이 없어요/)).toBeDefined();
  expect(screen.queryByTestId("world-translated")).toBeNull();
  expect(screen.queryByRole("group", { name: "나라 고르기" })).toBeNull();
  expect(screen.getByRole("button", { name: WORLD_EXAMPLES[0] })).toBeDefined();
});

test("DEC-074 판례 탭은 그대로 판례 검색을 쓴다", async () => {
  api.searchCases.mockResolvedValue({
    ok: true,
    data: { items: [], outcome: "no_result_in_scope", searchScopeNote: "", notice: "법제처" },
  });
  render(<SearchView />);
  fireEvent.change(screen.getByRole("textbox", { name: "판례 검색어" }), {
    target: { value: "보증금" },
  });
  fireEvent.submit(screen.getByRole("textbox", { name: "판례 검색어" }).closest("form")!);
  expect(await screen.findByText(/로 찾은 판례가 없어요/)).toBeDefined();
  expect(api.searchCases).toHaveBeenCalledWith("보증금");
  expect(api.searchWorldLaws).not.toHaveBeenCalled();
});

test("DEC-074 국기는 장식이라 보조 기술에 읽히지 않고, 나라마다 그림이 있다", () => {
  for (const c of ["kr", "us", "eu", "jp", "uk", "ca", "au", "cn", "intl"] as const) {
    const { container, unmount } = render(<Flag country={c} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("height")).toBe("14");
    expect(svg.children.length).toBeGreaterThan(0);
    unmount();
  }
});
