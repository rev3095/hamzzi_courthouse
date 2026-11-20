import { describe, expect, test } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { SECTION_LABELS } from "@/lib/procedure/sections";
import { CHECK_TEXTS, checklistFor } from "./checklist";
import { similarExamples } from "./examples";
import { extractFacts } from "./facts";
import { LEXICON, PRECEDENCE, normText, type Section } from "./lexicon";
import {
  CONFIDENCE_TEXT,
  NO_DATA_NOTE,
  OFFLINE_OTHER_BODY,
  READER_NOTICE,
  URGENT_NOTE,
  OWES_ONLY_TEXT,
  readOffline,
  sectionName,
} from "./read";
import { detectRole, ROLE_TEXT } from "./role";
import { ONLINE_READER_ENABLED, chooseReader } from "./source";

const read = (q: string, category?: Parameters<typeof readOffline>[0]["category"]) => {
  const r = readOffline({ question: q, category });
  if (r.status !== "read") throw new Error("too short");
  return r;
};

/** 아라비아 숫자, 또는 한글 수사 + 기간·금액 단위 (lib/procedure/policy.test.ts와 같은 기준) */
const NUMBER =
  /[0-9０-９]|(?:^|[^가-힣])[일이삼사오육칠팔구십백천만]+\s*(?:일|주|개월|년|원)(?![가-힣])/;

describe("고정 문구", () => {
  const texts = [
    READER_NOTICE,
    NO_DATA_NOTE,
    OFFLINE_OTHER_BODY,
    OWES_ONLY_TEXT,
    URGENT_NOTE,
    ...Object.values(CONFIDENCE_TEXT),
    ...Object.values(ROLE_TEXT),
    ...CHECK_TEXTS,
  ];
  test.each(texts)("숫자·단정 표현이 없다: %s", (t) => {
    expect(NUMBER.test(t)).toBe(false);
    expect(isAssertive(t)).toBe(false);
  });
  test("승패·유불리 낱말을 쓰지 않는다", () => {
    for (const t of texts) expect(t).not.toMatch(/승소|패소|이길|질 수|유리|불리|처벌받|무죄|유죄/);
  });
  test("AI가 만들지 않았다는 고지를 쓴다", () => {
    expect(READER_NOTICE).toContain("AI 생성 아님");
    expect(READER_NOTICE).toContain("법률 자문 아님");
  });
});

describe("사전·순서", () => {
  const sections = SECTION_LABELS.filter((l) => l !== "none") as Section[];
  test("모든 섹션에 낱말과 우선순위가 있다", () => {
    for (const s of sections) {
      expect(LEXICON[s]?.length, s).toBeGreaterThan(0);
      expect(PRECEDENCE, s).toContain(s);
    }
    expect(new Set(PRECEDENCE).size).toBe(PRECEDENCE.length);
  });
  test("모든 섹션에 확인 항목 묶음이 있다 (기본 항목으로 떨어지지 않는다)", () => {
    const facts = extractFacts("");
    const fallback = checklistFor(null, "claimant", facts, "");
    for (const s of sections) {
      const c = checklistFor(s, "claimant", facts, "");
      if (s !== "money") expect(c, s).not.toEqual(fallback);
    }
  });
  test("normText는 공백·문장부호·감탄 자모를 뺀다", () => {
    expect(normText("벽돌이 옴. ㅠㅠ 어떡해요?!")).toBe("벽돌이옴어떡해요");
  });
});

describe("입장", () => {
  test.each([
    ["술 먹고 싸웠는데 상대가 저를 폭행으로 고소했대요", "accused"],
    ["경찰서에서 피해자 조사 받으러 오라고 연락 왔어요 맞은 건 저예요", "claimant"],
    ["법원에서 지급명령 정본이 날아왔어요", "sued"],
    ["친구한테 빌린 돈 못 갚았는데 친구가 갚으래요", "owes"],
    ["친구한테 빌려준 돈을 못 받았어요", "claimant"],
    // 상대의 요구를 전하는 꼴 → 갚을 쪽
    ["세입자가 보증금 돌려달라고 하는데 저도 돈이 없어요", "owes"],
    ["세입자 [이름1] 씨가 보증금 돌려달라고 하는데 저도 돈이 없어요", "owes"],
    ["친구가 자기가 빌려준 돈 갚으라고 난리예요", "owes"],
    ["퇴사한 직원이 퇴직금 달라고 해요 줘야 하나요", "owes"],
    ["거래처가 물건값 내놓으라고 독촉해요", "owes"],
    ["옆집에서 누수 수리비 물어내라고 하는데 우리 집 탓인지 모르겠어요", "owes"],
    ["전 남친이 사귈 때 준 돈 갚으래요", "owes"],
    // 내가 요구하는 꼴 → 요구하는 쪽 그대로
    ["집주인이 보증금을 안 돌려줘요", "claimant"],
    ["집주인한테 보증금 돌려달라고 하는데 계속 미뤄요", "claimant"],
    ["사장한테 월급 달라고 하는데 안 줘요", "claimant"],
    ["문자로 여러 번 돌려달라고 했어요", "claimant"],
    ["회사에 퇴직금 지급하라고 요구했어요", "claimant"],
    ["두 쇼핑몰 가격이 서로 달라요 환불 되나요", "claimant"],
    ["아이를 달래요 그런데 옆집 개가 물었어요", "claimant"],
    ["건물주가 새 임차인 구할 때까지 기다려 달라고 하는데 권리금은요", "claimant"],
    // legal-reviewer가 찾은 뒤집힘 사례 — 요구하는 쪽·피해자 그대로여야 한다
    ["몸캠 피싱 당했는데 영상 뿌린다며 돈 보내라고 협박해요", "claimant"],
    ["경찰이 진단서 내라고 하는데 어디서 떼나요", "claimant"],
    ["회사에서 사직서 내라고 하는데 퇴직금은 받을 수 있나요", "claimant"],
    ["가해자 부모가 용서해 주라고 하는데 고소하고 싶어요", "claimant"],
    ["전 남친이 계속 만나 달라고 하는데 무서워요", "claimant"],
    ["누수 고쳐 달라고 하는데 집주인이 미뤄요", "claimant"],
    ["보증금 돌려달라고 하는데 집주인이 새 세입자 구하면 준대요", "claimant"],
    ["제가 돌려달라고 하는데 계속 미뤄요", "claimant"],
    ["회사에 퇴직금 달라고 하는데 다음 달에 준대요", "claimant"],
    ["몇 번 달라고 해서 겨우 일부 받았어요", "claimant"],
    ["구청에서 과태료 내라고 하는데 억울해요", "claimant"],
    ["세무서에서 세금 더 내라고 하는데 이의신청 되나요", "claimant"],
    // 나를 가리키는 받는 사람은 상대의 요구다
    ["세입자가 저한테 보증금 돌려달라고 하는데 돈이 없어요", "owes"],
    ["세입자가 계약 끝났다고 보증금 지금 당장 돌려달라는데 돈이 없어요", "owes"],
    // 두 번째 검토의 뒤집힘 사례 — 다른 절의 주어, 행위가 붙은 돈, 받는 사람, 이름 자리
    ["회사에서 3년 일했는데 밀린 월급 달라고 하는데 계속 미뤄요", "claimant"],
    ["업체에서 공사했는데 하자가 있어서 공사비 돌려달라고 하는데 업체가 버텨요", "claimant"],
    ["윗집에서 물이 새서 수리비 변상하라고 하는데 윗집이 버텨요", "claimant"],
    ["세입자가 월세를 석 달째 안 내서 밀린 월세 지급하라고 하는데 버텨요", "claimant"],
    ["세입자가 나간 뒤 집을 보니 엉망이라 수리비 변상하라고 하는데 버텨요", "claimant"],
    ["직원이 횡령한 돈 돌려달라고 하는데 모른 척해요", "claimant"],
    ["가해자가 오히려 치료비 내놓으라고 하는데 제가 맞았어요", "claimant"],
    ["전남친이 헤어지자니까 그동안 쓴 돈 다 내놓으라고 하면서 집 앞에 찾아와요", "claimant"],
    ["형이랑 누나한테 빌려준 돈 갚으라고 하는데 둘 다 미뤄요", "claimant"],
    ["제 이름은 이름1고 원룸 보증금 돌려달라고 하는데 집주인이 계속 미뤄요", "claimant"],
    ["안녕하세요 세입자 이름1입니다 보증금 돌려달라고 하는데 집주인이 계속 미뤄요", "claimant"],
    ["집주인 이름1한테 2년 전에 계약하면서 낸 보증금 돌려달라고 하는데 계속 미뤄요", "claimant"],
    ["보증금 돌려달라는데 집주인이 새 세입자 구하면 준대요", "claimant"],
    ["제가 친구한테 갚으라고 하는데 계속 미뤄요", "claimant"],
    // 수사를 받는 쪽: 피해자가 합의금을 요구
    ["피해자가 합의금 달라고 하는데 너무 많아요", "accused"],
    ["전처가 양육비 달라고 하는데 저도 형편이 어려워요", "owes"],
    ["이혼한 전남편이 결혼할 때 준 돈 갚으래요", "owes"],
  ])("%s → %s", (q, role) => {
    expect(detectRole(normText(q))).toBe(role);
  });
  test("수사를 받는 쪽에게 피해자 절차를 보이지 않는다", () => {
    const r = read("제가 단톡에 쓴 글 때문에 명예훼손으로 고소당했어요");
    expect(r.section).toBe("respond_criminal");
    expect(r.role).toBe("accused");
  });
  test("받는 쪽에게 요구하는 쪽 절차·예시를 함께 권하지 않는다", () => {
    const r = read(
      "술 먹고 싸웠는데 상대가 저를 폭행으로 고소했대요. 저도 맞아서 전치 2주 나왔어요",
    );
    expect(r.section).toBe("respond_criminal");
    expect(r.also).not.toContain("assault");
    expect(r.candidates.map((c) => c.section)).not.toContain("assault");
    expect(r.examples.every((e) => e.sameSection)).toBe(true);
  });
  test("내용증명만 받은 요구하는 쪽 질문은 입장과 절차가 같은 방향", () => {
    const r = read("상가 월세가 밀렸다고 건물주가 내용증명을 보내왔는데 권리금은 어떻게 되나요");
    if (r.role === "claimant")
      expect(r.plan.kind === "notice" ? r.plan.caseType : r.plan.caseType).not.toBe(
        "respond_civil",
      );
  });
  test("화면용 섹션 이름에 내부 영어 이름이 없다", () => {
    for (const s of PRECEDENCE) expect(sectionName(s)).not.toMatch(/[a-z]{3,}_[a-z]/);
  });
  test("군인 신분으로 수사를 받는 쪽은 군형법 절차", () => {
    expect(read("휴가 복귀를 하루 늦게 했더니 군무이탈로 조사받으래요").section).toBe(
      "military_criminal",
    );
  });
  test("내가 소송을 건 쪽이면 서류를 받은 쪽으로 보지 않는다", () => {
    expect(read("제가 민사를 걸어서 상대한테 소장까지 도달했는데 연락이 없어요").role).not.toBe(
      "sued",
    );
  });
  test("상대가 돌려달라고 한다고 전하는 집주인 질문은 세입자 절차 대신 범위 밖 안내", () => {
    const r = read("세입자가 보증금 돌려달라고 하는데 저도 돈이 없어요");
    expect(r.role).toBe("owes");
    expect(r.label).toBe("none");
    expect(r.plan.kind === "notice" && r.plan.caseType).toBe("defendant");
    expect(r.confidenceText).toBe(OWES_ONLY_TEXT);
  });
  test("양육비를 요구받는 쪽에게 받아내는 쪽 이혼·양육비 절차를 보이지 않는다", () => {
    // "전처가"는 개인정보 가리기가 이름으로 가려 주어가 사라진다(lib/pii 오탐, 별도) — 가려지지 않는 주어로 본다
    const r = read("상대방이 양육비 달라고 하는데 저도 형편이 어려워요");
    expect(r.plan.kind === "notice" && r.plan.caseType).toBe("defendant");
  });
  test("내가 집주인에게 요구하는 질문은 그대로 보증금 반환 절차", () => {
    const r = read("집주인한테 보증금 돌려달라고 하는데 계속 미뤄요");
    expect(r.role).toBe("claimant");
    expect(r.section).toBe("lease_deposit");
  });
  test("서류 없이 갚아야 하는 쪽은 타임라인 대신 범위 밖 안내", () => {
    const r = read("세입자가 계약 끝났다고 보증금을 지금 당장 달래요 저도 돈이 없는데");
    expect(r.label).toBe("none");
    expect(r.plan.kind).toBe("notice");
  });
});

describe("판독", () => {
  test("뚜렷한 질문은 그 섹션 타임라인", () => {
    const r = read("전세 계약 끝났는데 집주인이 보증금을 안 돌려줘요");
    expect(r.section).toBe("lease_deposit");
    expect(r.confidence).toBe("clear");
    expect(r.plan.kind).toBe("timeline");
  });
  test("잡담·의견은 섹션을 고르지 않는다", () => {
    const r = read("판사는 어떻게 되는 건가요 궁금해서요");
    expect(r.label).toBe("none");
    expect(r.confidence).toBe("unknown");
  });
  test("판독이 약하면 사용자가 고른 분야를 쓴다", () => {
    const r = read("이거 어떻게 해야 할지 모르겠어요 도와주세요", "lease");
    expect(r.confidence).toBe("chosen");
    expect(r.section).toBe("lease_deposit");
  });
  test("요구하는 쪽이면 사용자가 고른 분야가 판독보다 먼저", () => {
    expect(read("회사에서 월급을 석 달째 안 줘요", "lease").section).toBe("lease_deposit");
  });
  test("받는 쪽이면 고른 분야보다 그 입장의 절차", () => {
    expect(read("상대가 저를 폭행으로 고소했대요 경찰서에서 출석하래요", "assault").section).toBe(
      "respond_criminal",
    );
  });
  test("절차를 정하지 못하면 인터넷 없는 안내 문구", () => {
    const r = read("판사는 어떻게 되는 건가요 궁금해서요");
    expect(r.plan.kind === "notice" && r.plan.body).toBe(OFFLINE_OTHER_BODY);
  });
  test("너무 짧으면 판독하지 않는다", () => {
    expect(readOffline({ question: "도와줘요" }).status).toBe("too_short");
  });
  test("개인정보를 가린 문장으로 판독하고 가린 수를 알린다", () => {
    const r = read("홍길동 010-1234-5678 에게 빌려준 돈을 못 받았어요");
    expect(r.masked).not.toContain("010-1234-5678");
    expect(r.maskedCount).toBeGreaterThan(0);
  });
  test("위급 신호가 있으면 긴급 안내를 맨 앞에", () => {
    const r = read("남편이 지금 칼을 들고 죽이겠다고 해요");
    expect(r.urgent).toBe(true);
    expect(r.notes[0]).toBe(URGENT_NOTE);
  });
  test("인터넷 없이 정리했다는 안내와 고지를 늘 붙인다", () => {
    const r = read("중고거래로 돈 보냈는데 판매자가 잠수탔어요");
    expect(r.notes).toContain(NO_DATA_NOTE);
    expect(r.notice).toBe(READER_NOTICE);
  });
});

describe("사실 정리", () => {
  test("질문에 쓴 표현만 뽑는다 (새 숫자를 만들지 않는다)", () => {
    const q =
      "작년 3월에 친구에게 300만 원을 빌려줬어요. 차용증은 없고 카톡만 있어요. 내용증명을 보냈어요";
    const f = extractFacts(q);
    for (const x of [...f.when, ...f.money]) expect(q.replace(/\s+/g, " ")).toContain(x);
    expect(f.money).toContain("300만 원");
    expect(f.evidence).toEqual(expect.arrayContaining(["메신저 대화"]));
    expect(f.done).toContain("내용증명을 보냄");
    expect(f.parties).toContain("친구");
  });
  test("확인 항목을 적어 준 것과 더 확인할 것으로 나눈다", () => {
    const r = read("작년 3월에 친구에게 300만 원을 빌려줬는데 안 갚아요. 차용증 있어요");
    expect(r.checklist.given.length).toBeGreaterThan(0);
    expect(r.checklist.missing.length).toBeGreaterThan(0);
  });
  test("월세·금액 숫자를 날짜로, 낱말 속 글자를 금액으로 뽑지 않는다", () => {
    const f = extractFacts("보증금 1000 월세 50인데 제 돈이 만원밖에 없어요. 3월 5일에 이사해요");
    expect(f.when).toEqual(["3월 5일"]);
    expect(f.money).not.toContain("이 만원");
  });
  test("상대가 했다는 일은 내가 해 본 일로 뽑지 않는다", () => {
    const f = extractFacts("상대가 저를 폭행으로 고소했대요. 다음 주에 출석하래요");
    expect(f.done).not.toContain("고소함");
    expect(f.when).toContain("다음 주");
    expect(extractFacts("어제 경찰서에 고소장을 접수했어요").done).toContain("고소함");
  });
  test("없다고 한 자료는 가진 자료로 뽑지 않는다", () => {
    const f = extractFacts("근로계약서는 없고 카톡만 있어요");
    expect(f.evidence).not.toContain("근로계약서");
    expect(f.evidence).toContain("메신저 대화");
    expect(extractFacts("차용증 따로 없어요").evidence).not.toContain("차용증");
  });
  test("'형'은 다른 낱말 안에서 상대방으로 뽑지 않는다", () => {
    expect(extractFacts("형사 고소를 하고 싶어요").parties).not.toContain("형");
  });
});

describe("예시·온라인", () => {
  test("같은 섹션의 예시를 먼저 고른다", () => {
    const ex = similarExamples("lease_deposit", "전세 보증금을 못 받았어요");
    expect(ex.length).toBeGreaterThan(0);
    expect(ex[0].sameSection).toBe(true);
  });
  test("DEC-049 온라인 판독은 켜져 있고, 인터넷이 없으면 언제나 오프라인 판독", () => {
    expect(ONLINE_READER_ENABLED).toBe(true);
    expect(chooseReader({ online: true })).toBe("online");
    expect(chooseReader({ online: false })).toBe("offline");
  });
});
