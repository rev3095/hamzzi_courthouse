// F-018 '진행 과정' 갈래 문안 검사: 입장(하는 쪽 / 받은 쪽) × 형사·민사.
// 고정 문안에 숫자·단정·판정 표현이 없고(절대 규칙 2·3), 공식 링크만 쓰며, 갈래마다 내용이 다르다.
import { describe, expect, test } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { DIFFICULTY_LABEL } from "@/lib/procedure/steps";
import {
  PATH_KINDS,
  PATH_KIND_LABEL,
  PATH_LEAD,
  PATH_SIDES,
  PATH_SIDE_LABEL,
  allPaths,
  assistantPaths,
  hasPaths,
  type PathKind,
  type PathSide,
} from "./paths";

/** lib/procedure/policy.test.ts와 같은 숫자 규칙: 아라비아 숫자, 한글 수사 + 기간·금액 단위 */
const NUMBER =
  /[0-9０-９]|(?:^|[^가-힣])[일이삼사오육칠팔구십백천만]+\s*(?:일|주|개월|년|원)(?![가-힣])/;

const texts = [
  ...allPaths().flatMap((p) => [
    p.section,
    p.title,
    p.note ?? "",
    ...p.steps.flatMap((s) => [s.label, s.question, ...s.prepare, ...s.cautions]),
  ]),
  ...Object.values(PATH_SIDE_LABEL),
  ...Object.values(PATH_KIND_LABEL),
  ...PATH_KINDS.flatMap((k) => PATH_SIDES.map((s) => PATH_LEAD[k][s])),
];

describe("F-018 진행 과정 갈래 (입장 × 형사·민사)", () => {
  test("고소미·중고천국만 갈래를 쓰고, 네 갈래 모두 절차가 있다", () => {
    expect(hasPaths("home")).toBe(false);
    for (const id of ["report", "market"] as const) {
      expect(hasPaths(id)).toBe(true);
      for (const kind of PATH_KINDS)
        for (const side of PATH_SIDES)
          expect(assistantPaths(id, side, kind).length, `${id} ${kind} ${side}`).toBeGreaterThan(0);
    }
  });

  test("갈래마다 단계 구성이 다르다", () => {
    for (const id of ["report", "market"] as const) {
      const shapes = PATH_KINDS.flatMap((kind) =>
        PATH_SIDES.map((side) =>
          assistantPaths(id, side, kind)[0]
            .steps.map((s) => s.label)
            .join(">"),
        ),
      );
      expect(new Set(shapes).size, id).toBe(shapes.length);
    }
  });

  test("하는 쪽 형사 갈래에는 민사 청구 단계가 없고, 받은 쪽 갈래에는 고소·신고 단계가 없다", () => {
    for (const id of ["report", "market"] as const) {
      for (const p of assistantPaths(id, "claimant", "criminal"))
        for (const s of p.steps) expect(s.label, p.title).not.toMatch(/손해배상|민사/);
      for (const kind of PATH_KINDS)
        for (const p of assistantPaths(id, "respondent", kind))
          for (const s of p.steps) expect(s.label, p.title).not.toMatch(/고소·신고|^고소$/);
    }
  });

  test("하는 쪽 형사 갈래는 모두 수사기관 고소·신고 단계가 있다 (행정 신고·조정뿐인 절차를 형사로 두지 않는다)", () => {
    for (const id of ["report", "market"] as const)
      for (const p of assistantPaths(id, "claimant", "criminal")) {
        expect(
          p.steps.some((s) => /고소|신고/.test(s.label)),
          p.title,
        ).toBe(true);
        expect(p.steps.map((s) => s.label).join(" "), p.title).not.toMatch(/분쟁조정/);
        expect(p.note, p.title).toMatch(/민사|손해배상|배상명령/);
      }
  });

  test("글·채팅으로 고소당한 갈래는 합의가 결과와 무관하다고 말하지 않는다 (친고죄·반의사불벌죄)", () => {
    const cautions = assistantPaths("report", "respondent", "criminal")[0]
      .steps.flatMap((s) => s.cautions)
      .join(" ");
    expect(cautions).not.toMatch(/결과가 정해지는 것은 아니에요/);
    expect(cautions).toMatch(/고소를 취소하거나 처벌을 원하지 않는다는 뜻/);
    expect(cautions).toMatch(/직접 연락하지 말고/);
  });

  test("갈래마다 쓸 수 있는 서식이 다르다 (고소당한 쪽 형사 갈래만 서식이 없다)", () => {
    const formsOf = (id: "report" | "market", side: PathSide, kind: PathKind) =>
      [
        ...new Set(
          assistantPaths(id, side, kind).flatMap((p) => [
            ...p.steps.flatMap((s) => (s.document ? [s.document] : [])),
            ...(p.forms ?? []).map((f) => f.kind),
          ]),
        ),
      ].sort();
    expect(formsOf("market", "claimant", "criminal")).toEqual(
      ["compensation-order", "criminal-complaint", "trade-fraud-complaint"].sort(),
    );
    expect(formsOf("market", "claimant", "civil")).toEqual(
      ["complaint", "demand-letter", "payment-order", "property-disclosure"].sort(),
    );
    expect(formsOf("report", "claimant", "criminal")).toEqual(
      ["defamation-complaint", "obscenity-complaint"].sort(),
    );
    expect(formsOf("report", "claimant", "civil")).toEqual(
      ["complaint", "demand-letter", "property-disclosure"].sort(),
    );
    for (const id of ["report", "market"] as const) {
      expect(formsOf(id, "respondent", "civil")).toEqual(
        ["answer", "decision-objection", "order-objection"].sort(),
      );
      expect(formsOf(id, "respondent", "criminal")).toEqual([]);
    }
  });

  test("절대 규칙 3 숫자(기간·금액)를 넣지 않는다", () => {
    for (const t of texts) expect(t, t).not.toMatch(NUMBER);
  });

  test("절대 규칙 2 단정·승패·유불리 표현이 없다", () => {
    for (const t of texts) {
      expect(isAssertive(t), t).toBe(false);
      expect(t, t).not.toMatch(/승소|패소|이길|가능성|확률|승률|유리|불리|무죄|유죄/);
    }
  });

  test("모든 단계에 난이도 라벨·준비물·주의점·공식 링크·질문이 있고, 한 갈래 안에서 키가 겹치지 않는다", () => {
    for (const p of allPaths()) {
      expect(new Set(p.steps.map((s) => s.key)).size, p.key).toBe(p.steps.length);
      expect(
        p.steps.some((s) => s.key === p.recommended),
        p.key,
      ).toBe(true);
      for (const s of p.steps) {
        expect(DIFFICULTY_LABEL[s.difficulty]).toBeTruthy();
        expect(s.prepare.length, s.label).toBeGreaterThan(0);
        expect(s.cautions.length, s.label).toBeGreaterThan(0);
        expect(s.links.length, s.label).toBeGreaterThan(0);
        expect(s.question.trim().length, s.label).toBeGreaterThan(0);
        for (const l of s.links)
          expect(l.url).toMatch(/^https:\/\/([a-z0-9-]+\.)+(go\.kr|or\.kr|gov\.kr)$/);
      }
    }
  });

  test("받은 쪽 형사 갈래는 조사에서의 권리를 알리고, 받은 쪽 민사 갈래는 기간을 숫자 없이 서류 기준으로 말한다", () => {
    for (const id of ["report", "market"] as const) {
      const accused = assistantPaths(id, "respondent", "criminal")[0];
      expect(accused.steps.flatMap((s) => s.cautions).join(" ")).toMatch(
        /진술을 거부할 권리.*변호인/,
      );
      const sued = assistantPaths(id, "respondent", "civil")[0];
      expect(sued.steps[0].cautions.join(" ")).toMatch(/서류에 적힌 기간/);
    }
  });
});
