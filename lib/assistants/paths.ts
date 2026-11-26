// 전문 에이전트 '진행 과정'의 갈래 (F-018, 사용자 요청 2026-11-26): 고소미·중고천국은 입장(하는 쪽 / 받은 쪽)과
// 형사·민사를 골라 그 갈래의 절차를 본다. 갈래마다 단계·준비할 것·주의할 점이 다르다.
// - 하는 쪽 갈래는 일반 답변과 같은 고정 문안(lib/procedure의 TRACKS·LIFE_TRACKS)에서 형사 단계·민사 단계를 나눠 쓴다.
// - 받은 쪽 갈래(고소당했을 때 / 소장·지급명령을 받았을 때)는 여기서 새로 쓴 고정 문안이다.
// 순수 상수다 — 모델을 부르지 않는다. 기간·비용 숫자와 결과 판정을 넣지 않고(절대 규칙 2·3), 기간은 "받은 서류에 적힌 기간"으로만 말한다.
// 문안 검사는 paths.test.ts (숫자·단정·판정 표현, 공식 링크, 단계 구성).
// 형사에는 원고·피고가 없어 화면 이름은 '고소·청구하는 쪽 / 고소·청구를 받은 쪽'으로 쓰고, 갈래마다 부르는 이름(고소인·피의자·원고·피고)을 따로 알려 준다.
import { LIFE_TRACKS, type LifeTrackKey } from "@/lib/procedure/life-tracks";
import { OFFICIAL, TRACKS, type ProcedureStep, type TrackKey } from "@/lib/procedure/steps";
import type { AssistantId } from "./agents";

export const PATH_SIDES = ["claimant", "respondent"] as const;
export type PathSide = (typeof PATH_SIDES)[number];
export const PATH_KINDS = ["criminal", "civil"] as const;
export type PathKind = (typeof PATH_KINDS)[number];

export const PATH_SIDE_LABEL: Record<PathSide, string> = {
  claimant: "고소·청구하는 쪽",
  respondent: "고소·청구를 받은 쪽",
};
export const PATH_KIND_LABEL: Record<PathKind, string> = { criminal: "형사", civil: "민사" };

/** 갈래마다 화면에 보이는 한 줄 설명 (부르는 이름과 이 절차가 정하는 것) */
export const PATH_LEAD: Record<PathKind, Record<PathSide, string>> = {
  criminal: {
    claimant:
      "수사기관에 처벌을 구하는 절차예요. 고소하는 사람을 '고소인'이라고 불러요. 피해 금액을 돌려받는 일은 주로 민사에서 다뤄요.",
    respondent:
      "고소를 당해 조사를 받는 절차예요. 고소당한 사람을 '피고소인', 조사 단계에서는 '피의자', 재판에 넘겨지면 '피고인'이라고 불러요. 조사에서 쓸 수 있는 권리부터 확인하세요.",
  },
  civil: {
    claimant:
      "법원에 손해배상이나 돈의 반환을 청구하는 절차예요. 소송을 내는 쪽을 '원고'라고 불러요. 처벌을 구하는 일은 형사에서 따로 다뤄요.",
    respondent:
      "법원에서 소장·지급명령·이행권고결정을 받았을 때의 절차예요. 청구를 받은 쪽을 '피고'(지급명령에서는 '채무자')라고 불러요. 받은 서류에 적힌 기간부터 확인하세요.",
  },
};

export type AssistantPath = {
  key: string;
  /** 타임라인 머리의 묶음 이름 (형사 · 고소하는 쪽 등) */
  section: string;
  title: string;
  steps: ProcedureStep[];
  /** 먼저 살펴볼 단계 키 (규칙으로 고정) */
  recommended: string;
  note?: string;
};

/** 이 에이전트가 갈래 고르기를 쓰는지 (내집마련은 분야별 타임라인만 본다) */
export function hasPaths(id: AssistantId): id is "report" | "market" {
  return id === "report" || id === "market";
}

type Source = { title: string; steps: ProcedureStep[]; recommended: string; note?: string };
const track = (key: string): Source =>
  key in TRACKS ? TRACKS[key as TrackKey] : LIFE_TRACKS[key as LifeTrackKey];
const step = (key: string, stepKey: string): ProcedureStep => {
  const found = track(key).steps.find((s) => s.key === stepKey);
  if (!found) throw new Error(`절차 단계가 없습니다: ${key}.${stepKey}`);
  return found;
};

/** 손해배상·민사 청구 단계인지 (하는 쪽 형사 갈래에서 뺀다) */
const isCivilStep = (s: ProcedureStep) => s.key === "civil" || /손해배상|민사/.test(s.label);

const sectionOf = (side: PathSide, kind: PathKind) =>
  `${PATH_KIND_LABEL[kind]} · ${PATH_SIDE_LABEL[side]}`;

// ── 받은 쪽: 고소당했을 때 (형사) ─────────────────────────────

function accusedSteps(
  records: string[],
  keepCaution: string,
  /** 합의가 절차에 주는 영향은 죄의 종류마다 달라 갈래별로 적는다 */
  settleCaution: string,
): ProcedureStep[] {
  return [
    {
      key: "summons",
      label: "연락·출석 요구 확인",
      difficulty: "self",
      prepare: [
        "수사기관에서 받은 연락이나 출석요구서",
        "사건을 맡은 경찰서·부서와 담당자 연락처",
        "어떤 일로 조사받는지 적힌 내용",
      ],
      cautions: [
        "출석 날짜가 어려우면 담당 수사관에게 연락해 일정을 조정해 달라고 할 수 있어요.",
        "정당한 이유 없이 계속 응하지 않으면 강제 절차로 이어질 수 있어요. 일정부터 확인하세요.",
      ],
      links: [OFFICIAL.police, OFFICIAL.klac],
      question: "경찰에서 조사받으러 오라는 연락을 받았어요. 무엇부터 해야 하나요?",
    },
    {
      key: "records",
      label: "내 자료 정리",
      difficulty: "self",
      prepare: records,
      cautions: [keepCaution, "기억나는 일을 날짜 순서로 적어 두면 조사에서 설명하기 쉬워요."],
      links: [OFFICIAL.klac],
      question: "고소를 당했을 때 어떤 자료를 정리해 두어야 하나요?",
    },
    {
      key: "interview",
      label: "조사 받기",
      difficulty: "expert",
      prepare: ["신분증", "정리한 자료와 날짜순 메모", "변호인과 함께 갈지 여부"],
      cautions: [
        "조사에서는 진술을 거부할 권리와 변호인의 도움을 받을 권리가 있어요.",
        "조서는 서명하기 전에 끝까지 읽고, 말한 것과 다르게 적힌 부분은 고쳐 달라고 할 수 있어요.",
        "혼자 대응하기 어렵다면 조사 전에 전문가 상담을 권해요.",
      ],
      links: [OFFICIAL.klac, OFFICIAL.police],
      question: "피의자 조사에서는 어떤 권리가 있고 무엇을 조심해야 하나요?",
    },
    {
      key: "settlement",
      label: "피해 회복·합의 협의",
      difficulty: "depends",
      prepare: ["상대방에게 전할 내용과 방법", "합의하게 되면 그 내용을 적은 문서"],
      cautions: [
        settleCaution,
        "상대방이 원하지 않으면 직접 연락하지 말고, 담당 수사관이나 변호인을 통해 뜻을 확인하세요. 연락이나 접근을 막는 조치가 내려져 있으면 연락하는 것부터 문제가 돼요.",
        "혐의를 다투는 경우에는 이 단계가 해당하지 않을 수 있어요. 할지 말지는 본인이 정해요.",
      ],
      links: [OFFICIAL.klac],
      question: "고소한 사람과 합의를 하려면 어떻게 진행하나요?",
    },
    {
      key: "disposition",
      label: "수사 결과 확인",
      difficulty: "depends",
      prepare: ["수사기관에서 온 결과 통지"],
      cautions: [
        "결과에 따라 사건이 끝나기도 하고 재판으로 이어지기도 해요. 통지서에 적힌 안내를 확인하세요.",
        "법원이 서류만 보고 벌금 등을 정한 명령을 보내올 수도 있어요. 다투려면 그 서류에 적힌 기간을 확인하세요.",
      ],
      links: [OFFICIAL.police],
      question: "수사 결과 통지를 받으면 그다음은 어떻게 되나요?",
    },
    {
      key: "trial",
      label: "재판",
      difficulty: "expert",
      prepare: ["법원에서 온 서류", "변호인을 선임할지 여부"],
      cautions: [
        "법원 서류에 적힌 날짜와 기한을 먼저 확인하세요.",
        "변호인을 구하기 어려운 사정이 있으면 국선변호인 제도를 법원에 문의할 수 있어요.",
      ],
      links: [OFFICIAL.klac],
      question: "형사재판을 받게 되면 무엇을 준비해야 하나요?",
    },
  ];
}

// ── 받은 쪽: 소장·지급명령을 받았을 때 (민사) ─────────────────────

function suedSteps(records: string[]): ProcedureStep[] {
  return [
    {
      key: "papers",
      label: "받은 서류 확인",
      difficulty: "self",
      prepare: [
        "법원에서 온 서류 (소장 부본, 지급명령, 이행권고결정 가운데 무엇인지)",
        "서류를 받은 날짜",
        "사건번호와 법원 이름",
      ],
      cautions: [
        "서류에 적힌 기간 안에 답변서나 이의신청서를 내지 않으면 상대방이 청구한 대로 정해질 수 있어요.",
        "기간은 받은 서류와 법원 안내에 적혀 있어요. 받은 날짜를 적어 두세요.",
      ],
      links: [OFFICIAL.ecfs, OFFICIAL.klac],
      question: "소장이나 지급명령을 받았어요. 무엇부터 확인해야 하나요?",
    },
    {
      key: "answer",
      label: "답변서·이의신청",
      difficulty: "depends",
      prepare: [
        "답변서 (소장을 받은 경우) 또는 이의신청서 (지급명령·이행권고결정을 받은 경우)",
        "상대방 주장 가운데 인정하는 부분과 다투는 부분",
        "다투는 이유",
      ],
      cautions: [
        "다투는 이유는 감정이 아니라 사실을 중심으로 적어요.",
        "지급명령이나 이행권고결정에 이의를 내면 소송 절차로 이어져요.",
      ],
      links: [OFFICIAL.ecfs],
      question: "답변서나 지급명령 이의신청서는 어떻게 쓰고 어디에 내나요?",
    },
    {
      key: "records",
      label: "자료 준비·제출",
      difficulty: "self",
      prepare: records,
      cautions: ["자료는 있는 그대로 내요. 고치거나 일부만 잘라 내면 문제가 될 수 있어요."],
      links: [OFFICIAL.ecfs],
      question: "소송에서 내 주장을 보여 주려면 어떤 자료를 내야 하나요?",
    },
    {
      key: "hearing",
      label: "조정·변론",
      difficulty: "expert",
      prepare: ["기일 통지서", "말할 내용을 정리한 서면"],
      cautions: [
        "정해진 날에 나가지 않으면 내 사정을 말할 기회를 놓칠 수 있어요.",
        "조정은 양쪽이 받아들여야 성립해요. 받아들이기 어려우면 그렇게 말할 수 있어요.",
        "법원이 조정안을 결정으로 보내오면 서류에 적힌 기간 안에 이의할 수 있어요. 이의하지 않으면 그대로 정해질 수 있어요.",
        "절차가 복잡해 전문가 상담을 권해요.",
      ],
      links: [OFFICIAL.ecfs, OFFICIAL.klac],
      question: "변론기일이나 조정기일에는 무엇을 하게 되나요?",
    },
    {
      key: "after",
      label: "판결 뒤",
      difficulty: "depends",
      prepare: ["판결문", "판결 내용대로 이행할지, 다시 다툴지에 대한 결정"],
      cautions: ["다시 다툴 수 있는 기간이 정해져 있어요. 판결문에 적힌 안내를 확인하세요."],
      links: [OFFICIAL.ecfs, OFFICIAL.klac],
      question: "판결을 받은 뒤에는 어떤 선택을 할 수 있나요?",
    },
  ];
}

// ── 하는 쪽: 형사 (기존 타임라인에서 민사 단계를 뺀다) ───────────────

const CIVIL_ELSEWHERE = "손해배상은 민사 절차에서 따로 청구할 수 있어요.";

function criminalOf(key: string, title?: string): AssistantPath {
  const t = track(key);
  const steps = t.steps.filter((s) => !isCivilStep(s));
  return {
    key: `${key}-criminal`,
    section: sectionOf("claimant", "criminal"),
    title: title ?? t.title,
    steps,
    recommended: steps.some((s) => s.key === t.recommended) ? t.recommended : steps[0].key,
    note:
      t.note && /민사|손해배상/.test(t.note)
        ? t.note
        : [t.note, CIVIL_ELSEWHERE].filter(Boolean).join(" "),
  };
}

// ── 하는 쪽: 민사 ────────────────────────────────────────────

const MONEY = (k: string) => step("money", k);

/** 글·욕설 피해의 내용증명: 금액 요구 서식(demand-letter)과 내용이 달라 서식 연결은 두지 않는다 */
const harmNotice = (online: boolean): ProcedureStep => ({
  ...MONEY("notice"),
  document: undefined,
  prepare: [
    "상대방 이름과 주소",
    online ? "요구하는 내용 (게시물 삭제, 사과, 손해배상)" : "요구하는 내용 (사과, 손해배상)",
    "언제까지 해 달라는 기한",
    "보내는 사람 이름·주소",
  ],
  cautions: [
    ...MONEY("notice").cautions,
    "상대방이 누구인지 모르면 보낼 수 없어요. 그때는 형사 고소로 수사기관이 확인하는 절차가 먼저일 수 있어요.",
  ],
  question: "욕설·명예훼손 피해로 내용증명을 보내려면 어떤 내용을 적어야 하나요?",
});

/** 글·욕설 피해의 손해배상 소송: 지급명령을 거치지 않는 갈래라 금전 청구 소송 단계의 문안을 따로 쓴다 */
const HARM_SUIT: ProcedureStep = {
  key: "suit",
  label: "손해배상 소송",
  difficulty: "expert",
  prepare: [
    "소장",
    "피해를 보여 주는 자료 (화면 캡처, 진료 기록 등)",
    "상대방 이름과 주소",
    "인지대·송달료 (법원 안내 기준)",
  ],
  cautions: [
    "배상할지와 그 금액은 법원이 사정을 살펴 정해요.",
    "절차가 복잡해 전문가 상담을 권해요.",
  ],
  links: [OFFICIAL.ecfs, OFFICIAL.klac],
  question: "욕설·명예훼손 피해로 손해배상 소송을 내려면 무엇을 준비해야 하나요?",
};

const HARM_NOTE =
  "손해배상을 청구하려면 상대방이 누구인지 알아야 해요. 모른다면 형사 고소가 먼저일 수 있고, 형사 절차와 민사 절차는 따로 진행돼요.";

function harmCivil(key: "defamation" | "insult", title: string): AssistantPath {
  const first = track(key).steps.filter((s) => s.key === "evidence" || s.key === "takedown");
  return {
    key: `${key}-civil`,
    section: sectionOf("claimant", "civil"),
    title,
    steps: [
      ...first,
      harmNotice(key === "defamation"),
      HARM_SUIT,
      MONEY("judgment"),
      MONEY("enforce"),
    ],
    recommended: "evidence",
    note: HARM_NOTE,
  };
}

// ── 에이전트별 갈래 ────────────────────────────────────────────

const POST_RECORDS = [
  "문제가 된 글·댓글·채팅 화면",
  "앞뒤 대화의 흐름을 보여 주는 화면",
  "글을 쓴 계정과 쓴 때",
];
const TRADE_RECORDS = [
  "거래 글과 대화 기록",
  "물건을 보낸 기록 (송장·배송 조회)",
  "환불하거나 돌려준 내역",
];

const respondentPath = (
  key: string,
  kind: PathKind,
  title: string,
  steps: ProcedureStep[],
): AssistantPath => ({
  key,
  section: sectionOf("respondent", kind),
  title,
  steps,
  recommended: steps[0].key,
  note:
    kind === "criminal"
      ? "이 안내는 절차의 순서를 알려 줄 뿐이에요. 조사에서 어떻게 말할지는 사건마다 달라 전문가 상담을 권해요."
      : "받은 서류에 적힌 기간이 지나기 전에 움직여야 해요. 기간과 내는 곳은 서류와 법원 안내를 따르세요.",
});

const PATHS: Record<"report" | "market", Record<PathKind, Record<PathSide, AssistantPath[]>>> = {
  report: {
    criminal: {
      claimant: [
        criminalOf("defamation"),
        criminalOf("insult"),
        criminalOf("sex_crime"),
        criminalOf("stalking"),
      ],
      respondent: [
        respondentPath(
          "post-accused",
          "criminal",
          "글·채팅 때문에 고소당했을 때",
          accusedSteps(
            POST_RECORDS,
            "글을 내리더라도 그 전에 원래 화면을 주소와 날짜가 보이게 그대로 보관하세요. 내용을 고치지 마세요.",
            "죄의 종류에 따라 고소를 취소하거나 처벌을 원하지 않는다는 뜻을 밝히는 것이 절차에 영향을 줄 수 있어요. 담당 수사관이나 전문가에게 확인하세요.",
          ),
        ),
      ],
    },
    civil: {
      claimant: [
        harmCivil("defamation", "온라인 글·채팅 피해 손해배상"),
        harmCivil("insult", "직접 들은 욕설·모욕 피해 손해배상"),
      ],
      respondent: [
        respondentPath(
          "post-sued",
          "civil",
          "글·채팅 때문에 손해배상 청구를 받았을 때",
          suedSteps(POST_RECORDS),
        ),
      ],
    },
  },
  market: {
    criminal: {
      claimant: [criminalOf("fraud", "거래 사기 고소")],
      respondent: [
        respondentPath(
          "trade-accused",
          "criminal",
          "거래 때문에 사기로 고소당했을 때",
          accusedSteps(
            TRADE_RECORDS,
            "대화나 거래 글을 지우거나 고치지 마세요. 있는 그대로 보관해요.",
            "합의는 양쪽이 정하는 일이고, 합의했다고 해서 수사나 재판의 결과가 정해지는 것은 아니에요.",
          ),
        ),
      ],
    },
    civil: {
      claimant: [
        {
          key: "fraud-civil",
          section: sectionOf("claimant", "civil"),
          title: "거래 피해금 돌려받기",
          steps: [
            step("fraud", "evidence"),
            MONEY("notice"),
            MONEY("order"),
            MONEY("suit"),
            MONEY("judgment"),
            MONEY("enforce"),
          ],
          recommended: "evidence",
          note: "상대방의 이름과 주소를 모르면 내용증명과 지급명령은 쓰기 어려워요. 그때는 형사 고소나 소송 절차에서 확인하는 방법을 검토하세요. 형사 고소와는 따로 진행되고, 형사재판이 열리면 그 재판에서 배상명령을 신청하는 방법도 있어요.",
        },
        {
          key: "consumer-civil",
          section: sectionOf("claimant", "civil"),
          title: track("consumer").title,
          steps: track("consumer").steps,
          recommended: track("consumer").recommended,
          note: track("consumer").note,
        },
      ],
      respondent: [
        respondentPath(
          "trade-sued",
          "civil",
          "거래 때문에 소장·지급명령을 받았을 때",
          suedSteps(TRADE_RECORDS),
        ),
      ],
    },
  },
};

export function assistantPaths(
  id: "report" | "market",
  side: PathSide,
  kind: PathKind,
): AssistantPath[] {
  return PATHS[id][kind][side];
}

/** 화면에 나갈 수 있는 갈래 문안 전부 (검사용) */
export function allPaths(): AssistantPath[] {
  return (["report", "market"] as const).flatMap((id) =>
    PATH_KINDS.flatMap((kind) => PATH_SIDES.flatMap((side) => PATHS[id][kind][side])),
  );
}
