// F-018 DEC-057 전문 에이전트 아카이브: 시나리오 비율·거르기 규칙·저장된 세트의 형식과 절대 규칙.
import { describe, expect, test, vi } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { findExample } from "@/lib/demo/policy";
import { scanInput } from "@/lib/pii";
import { ASSISTANT_IDS } from "./agents";
import { guideLineOk, screenGuide } from "./archive";
import { archiveOf, findArchiveItem } from "./archive-data";
import { ARCHIVE_SCENARIOS, scenariosOf } from "./archive-scenarios";
import { hasNumber } from "./talk";

vi.mock("server-only", () => ({}));

describe("DEC-057 아카이브 시나리오", () => {
  test("에이전트마다 10개, 원고 7 : 피고 3이고 번호가 겹치지 않는다", () => {
    for (const id of ASSISTANT_IDS) {
      const list = scenariosOf(id);
      expect(list, id).toHaveLength(10);
      expect(list.filter((s) => s.side === "plaintiff").length, id).toBe(7);
      expect(list.filter((s) => s.side === "defendant").length, id).toBe(3);
      expect(
        list.every((s) => s.id.startsWith(`${id}-`)),
        id,
      ).toBe(true);
    }
    expect(new Set(ARCHIVE_SCENARIOS.map((s) => s.id)).size).toBe(ARCHIVE_SCENARIOS.length);
  });

  test("서류 단계는 양쪽을 모두 담는다 — 내용증명 쓰기·받기, 소장 쓰기·받기, 내용 정리", () => {
    const stages = new Set(ARCHIVE_SCENARIOS.map((s) => s.stage));
    for (const s of [
      "organize",
      "notice_send",
      "notice_receive",
      "complaint_write",
      "complaint_receive",
    ])
      expect(stages.has(s as never), s).toBe(true);
  });

  test("질문은 가상 사연이라 개인정보로 보이는 것이 없다", () => {
    for (const s of ARCHIVE_SCENARIOS) expect(scanInput(s.question).findings, s.id).toEqual([]);
  });
});

describe("DEC-057 근거 없는 정리 문장 거르기 (guideLineOk)", () => {
  test("숫자·조문 번호·사건번호·결과 판정·단정 표현은 버린다", () => {
    for (const bad of [
      "답변서는 소장을 받은 날부터 30일 안에 내야 해요.",
      "삼 년이 지나면 청구할 수 없어요.",
      "민법 제750조에 따라 배상을 청구해요.",
      "대법원 2025도986 판결과 같은 사안이에요.",
      "승소 가능성이 높아요.",
      "반드시 처벌받게 됩니다.",
    ])
      expect(guideLineOk(bad), bad).toBe(false);
    expect(guideLineOk("답변서는 정해진 기간 안에 법원에 내야 해요.")).toBe(true);
    expect(guideLineOk("민사소송법이 정한 소장 기재 사항을 확인해요.")).toBe(true);
    // 법적 결론·근거 주장은 근거 문단에서만
    for (const bad of [
      "사기죄가 성립하려면 속이려는 뜻이 있어야 해요.",
      "명예훼손에 해당합니다.",
      "주택임대차보호법에 따라 계속 살 수 있어요.",
      "보증금을 돌려받으실 수 있어요.",
    ])
      expect(guideLineOk(bad), bad).toBe(false);
    // 절차를 가리키는 말은 통과
    for (const ok of ["법률구조 제도에 해당하는지 알아봐요.", "판결문을 받아 두세요."])
      expect(guideLineOk(ok), ok).toBe(true);
  });

  test("screenGuide는 걸린 줄만 빼고 나머지는 남긴다", () => {
    const g = screenGuide({
      situation: "계약이 끝났는데 보증금을 돌려받지 못하고 있어요.",
      steps: {
        now: "보증금 반환을 청구하는 단계예요.",
        next: ["지급명령을 알아봐요.", "30일 안에 내요."],
      },
      civil: { points: [], note: "" },
      criminal: { points: [], note: "주로 민사 문제예요." },
      evidence: [
        { item: "임대차계약서", why: "계약 내용을 보여 줘요.", status: "확인 필요" },
        { item: "송금 내역 1억 원", why: "보증금 지급", status: "있음" },
      ],
      document: { title: "소장을 쓸 때 정리할 것", steps: ["당사자를 적어요.", "반드시 이겨요."] },
    });
    expect(g.steps.next).toEqual(["지급명령을 알아봐요."]);
    expect(g.civilNote).toBeNull();
    expect(g.criminalNote).toBe("주로 민사 문제예요.");
    expect(g.evidence.map((e) => e.item)).toEqual(["임대차계약서"]);
    expect(g.document.steps).toEqual(["당사자를 적어요."]);
  });
});

describe("DEC-057 저장된 아카이브 세트", () => {
  const all = ASSISTANT_IDS.flatMap((id) => archiveOf(id));

  test("세트는 시나리오와 같은 질문·입장·단계이고, Opus 5.5 high로 만든 것이다", () => {
    for (const item of all) {
      const sc = ARCHIVE_SCENARIOS.find((s) => s.id === item.id);
      expect(sc, item.id).toBeDefined();
      expect(item.assistant).toBe(sc!.assistant);
      expect(item.side).toBe(sc!.side);
      expect(item.stage).toBe(sc!.stage);
      expect(item.question).toBe(scanInput(sc!.question).maskedText);
      expect(item.meta.model).toBe("claude-opus-5-5");
      expect(item.meta.effort).toBe("high");
    }
  });

  test("절대 규칙 1: 근거 답변·민사·형사 문단은 모두 그 세트 근거 목록에 있는 출처이고 검증을 거쳤다", () => {
    for (const item of all) {
      const known = new Set([
        ...item.result.articles.map((a) => a.id),
        ...item.result.cases.map((c) => `case:${c.caseNo}`),
        ...item.result.cases.map((c) => `case:${c.id}`),
      ]);
      for (const p of [
        ...item.result.answer.points,
        ...item.civil.points,
        ...item.criminal.points,
      ]) {
        expect(known.has(p.source), `${item.id}: ${p.source}`).toBe(true);
        expect(["verified", "quote_mismatch"]).toContain(p.check);
        expect(isAssertive(p.text), `${item.id}: ${p.text}`).toBe(false);
      }
    }
  });

  test("절대 규칙 2·3·4: 근거 없는 정리 문장에는 숫자·판정·단정·개인정보가 없다", () => {
    for (const item of all) {
      const lines = [
        item.situation,
        item.steps.now,
        ...item.steps.next,
        item.civil.note ?? "",
        item.criminal.note ?? "",
        ...item.evidence.flatMap((e) => [e.item, e.why]),
        item.document.title,
        ...item.document.steps,
      ].filter(Boolean);
      for (const s of lines) {
        expect(guideLineOk(s), `${item.id}: ${s}`).toBe(true);
        expect(hasNumber(s), `${item.id}: ${s}`).toBe(false);
      }
    }
  });

  test("체험하기: 아카이브 질문은 저장된 답을 재생한다 (findExample → 비용·횟수 0)", () => {
    for (const item of all) {
      expect(findArchiveItem(item.question)?.id).toBe(item.id);
      expect(findExample(item.question)?.result.assistant).toBe(item.assistant);
    }
  });
});
