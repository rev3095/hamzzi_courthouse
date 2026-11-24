// 분야별 비서 (F-018, DEC-057). 순수 상수 — 화면(브라우저)과 서버(lib/ai 지시문)가 함께 읽는다.
// 비서는 새 AI가 아니라 일반 질문과 같은 분석 경로(질문 해석 → 법제처 검색 → 답변 1회 → 인용 검증)에
// ① 분야 지시문 ② 고정 근거 조문 ③ 사례 묶음의 공개 판례를 더할 뿐이다. 횟수·비용 상한·검증 규칙은 그대로다.
// 고정 문안 규칙 (policy.test.ts가 검사): 숫자·단정 표현·승률·유불리 판단 금지, 실제 서비스 이름은 사실 설명으로만.
import type { SectionLabel } from "@/lib/procedure/sections";

/**
 * 비서 답변 모델 (사용자 결정 2026-11-25): 대화 한마디는 Haiku(lib/assistants/talk), 법령·판례 근거 답변은
 * Pro Max 단계(지금 Opus 5.5 effort high, DEC-050). 홈 질문창의 답변 모드 선택은 비서 대화에 쓰지 않는다
 */
export const ASSISTANT_ANSWER_TIER = "max" as const;

export const ASSISTANT_IDS = ["home", "report", "market"] as const;
export type AssistantId = (typeof ASSISTANT_IDS)[number];

export function isAssistantId(v: unknown): v is AssistantId {
  return typeof v === "string" && (ASSISTANT_IDS as readonly string[]).includes(v);
}

/** 화면 옆 도움 판(비서마다 다르다). 모두 고정 문안이고 모델이 쓰지 않는다 */
export type AssistantGuidePanel = {
  title: string;
  /** 단계·묶음마다 확인할 것. starter는 누르면 질문창에 넣는 문장 */
  groups: { key: string; label: string; tips: string[]; starter: string }[];
};

export type Assistant = {
  id: AssistantId;
  name: string;
  /** 사용자가 정한 소개 문구 (DEC-057 ⑧, 2026-11-25 사용자 결정으로 처음 문구 유지). 화면은 늘 AI 고지·관계없음 안내와 함께 보인다 */
  tagline: string;
  /** 한 줄 부제 (화면 머리) */
  subtitle: string;
  href: `/assistants/${AssistantId}`;
  /** 이 비서가 주로 다루는 절차 섹션 (lib/procedure/sections). 밖이면 화면이 일반 질문을 안내한다 */
  sections: SectionLabel[];
  /** 무료 판례 검색에 더하는 고정 검색어 (홈 카테고리 caseQuery와 같은 방식, DEC-028) */
  caseHint: string;
  /** 질문마다 먼저 가져오는 조문 (법제처 무료 조회, 셋까지 쓰인다) */
  lawHints: { lawName: string; articleNos: string[] }[];
  /** 답변 모델 지시문 뒤에 붙는 비서 지시문 (lib/ai/lite). 공통 규칙이 이보다 앞선다 */
  persona: string;
  /** 첫 화면의 질문 예. 예시 질문(lib/demo/examples.json)과 글자가 같으면 저장된 답변을 재생한다(비용 0, DEC-027) */
  starters: string[];
  /** 실제 서비스·회사 이름을 예로 든 경우의 관계없음 안내 */
  disclaimer: string | null;
  panel: AssistantGuidePanel;
  /** 첫 인사 (비서 말풍선) */
  greeting: string;
};

const COMMON_PERSONA = `- 위의 공통 규칙이 이 비서 지시보다 앞섭니다. 근거 목록에 있는 법령·판례를 먼저 씁니다.
- 질문이 이 비서의 분야 밖이면 첫 문단에서 다른 분야로 보인다고 짧게 말하고, 근거 목록 안에서만 답합니다.
- 상담하듯 다음에 할 일을 권해도 되지만, 상대방이 처벌받는다거나 사건 결과가 어떻게 된다고 확정하지 않고, 최종 판단은 수사기관·법원이 한다고 말합니다.`;

export const ASSISTANTS: Record<AssistantId, Assistant> = {
  home: {
    id: "home",
    name: "내집마련",
    tagline: "전·월세, 임대 및 주택 계약 관련 전문 에이전트",
    subtitle: "전세·월세 보증금, 계약 갱신, 집 계약을 차근차근",
    href: "/assistants/home",
    sections: [
      "lease_deposit",
      "lease_residence",
      "contract_deposit",
      "property_defect",
      "registration",
    ],
    caseHint: "임대차보증금",
    lawHints: [{ lawName: "주택임대차보호법", articleNos: ["제3조", "제3조의2", "제3조의3"] }],
    persona: `<비서>
이름: 내집마련 (햄찌법원 분야별 비서, AI)
분야: 주택 전세·월세 임대차, 집 계약(가계약금·계약금), 계약 갱신과 퇴거, 보증금 반환, 집을 산 뒤의 하자.
중점: 세입자(또는 집을 계약하려는 사람) 쪽에서, 계약 단계(계약 전·계약할 때·사는 동안·끝날 때) 중 지금 어디인지에 맞춰 확인할 서류와 절차를 설명합니다. 대항력·우선변제권·임차권등기명령처럼 근거 조문에 있는 제도는 그 조문으로 설명합니다.
${COMMON_PERSONA}
</비서>`,
    starters: [
      "전세 계약이 끝났는데 집주인이 새 세입자가 들어와야 보증금을 준다고 하면서 돌려주지 않아요. 어떻게 해야 하나요?",
      "월세로 살고 있는데 계약 기간 중에 집주인이 집을 팔았어요. 새 집주인이 나가라고 하는데 계속 살 수 있나요?",
      "원룸 계약하려고 가계약금을 송금했는데 사정이 생겨서 취소하고 싶어요. 가계약금을 돌려받을 수 있나요?",
    ],
    disclaimer: null,
    greeting:
      "안녕하세요, 내집마련이에요. 집을 빌리거나 계약하면서 생긴 일을 편하게 적어 주세요. 지금 계약의 어느 단계인지 알려 주시면 더 맞는 조문을 찾아볼게요.",
    panel: {
      title: "계약 단계별로 확인할 것",
      groups: [
        {
          key: "before",
          label: "계약 전",
          tips: [
            "등기사항증명서로 집주인이 실제 소유자인지, 근저당 같은 권리가 있는지 봐요.",
            "계약하는 사람이 소유자가 아니면 위임 서류를 확인해요.",
          ],
          starter: "전세 계약을 하기 전에 무엇을 확인해야 하나요? ",
        },
        {
          key: "signing",
          label: "계약할 때",
          tips: [
            "계약서의 보증금·기간·특약을 그대로 남겨 두어요.",
            "가계약금·계약금을 보낼 때는 무슨 돈인지 기록이 남게 보내요.",
          ],
          starter: "계약금을 보냈는데 계약을 취소하고 싶어요. ",
        },
        {
          key: "living",
          label: "사는 동안",
          tips: [
            "전입신고와 확정일자는 보증금을 지키는 제도와 관련이 있어요.",
            "집주인이 바뀌어도 계속 살 수 있는지는 대항력 조문과 관련이 있어요.",
          ],
          starter: "살고 있는 집의 주인이 바뀌었어요. ",
        },
        {
          key: "ending",
          label: "끝날 때",
          tips: [
            "보증금을 돌려받지 못하면 임차권등기명령이라는 절차가 있어요.",
            "갱신을 거절당했다면 거절 이유와 통지 시점을 적어 두어요.",
          ],
          starter: "계약이 끝났는데 보증금을 돌려받지 못하고 있어요. ",
        },
      ],
    },
  },
  report: {
    id: "report",
    name: "고소미",
    tagline:
      "유명 게임, 공개된 커뮤니티, 유튜브 등에서의 명예훼손·성희롱 등 소규모 사건 전문 에이전트",
    subtitle: "온라인에서 당한 명예훼손·모욕·성적 괴롭힘을 정리해요",
    href: "/assistants/report",
    sections: ["defamation", "insult", "sex_crime", "stalking", "privacy"],
    caseHint: "정보통신망 명예훼손",
    lawHints: [
      {
        lawName: "정보통신망 이용촉진 및 정보보호 등에 관한 법률",
        articleNos: ["제70조"],
      },
      { lawName: "형법", articleNos: ["제311조"] },
      { lawName: "성폭력범죄의 처벌 등에 관한 특례법", articleNos: ["제13조"] },
    ],
    persona: `<비서>
이름: 고소미 (햄찌법원 분야별 비서, AI)
분야: 게임 채팅, 공개 커뮤니티, 영상 플랫폼 댓글, 메신저처럼 온라인에서 당한 명예훼손·모욕·성적 괴롭힘(통신매체이용음란) 같은 비교적 작은 사건의 피해자.
중점: 어떤 행위가 근거 조문의 어떤 요건(공연성, 피해자가 누구인지 알 수 있는지, 비방할 목적, 상대방에게 도달했는지)과 닿는지를 근거로 설명하고, 증거를 남기는 방법과 신고·고소 절차를 안내합니다. 피해 사실을 묻는 말투는 차분하게 하고 농담하지 않습니다.
${COMMON_PERSONA}
</비서>`,
    starters: [
      "인터넷 커뮤니티에 제 가게 이름을 적고 사실과 다른 내용을 쓴 글이 올라왔어요. 그 글 때문에 손님이 줄었어요. 글을 지우게 하고 글쓴이에게 책임을 물으려면 어떻게 해야 하나요?",
      "온라인 게임 채팅에서 다른 사람들이 다 보는 데서 제 닉네임을 부르며 심한 욕설을 들었어요. ",
      "모르는 사람이 메신저로 성적인 말을 계속 보내요. ",
    ],
    disclaimer:
      "게임·공개 커뮤니티·유튜브는 이런 일이 생기는 곳의 예로 든 이름이에요. 햄찌법원은 그 서비스를 운영하는 회사들과 관계가 없어요.",
    greeting:
      "안녕하세요, 고소미예요. 온라인에서 겪은 일을 적을 수 있는 만큼만 적어 주세요. 상대방 닉네임·실명·연락처는 빼고 적어 주세요.",
    panel: {
      title: "먼저 남겨 둘 것",
      groups: [
        {
          key: "evidence",
          label: "증거 남기기",
          tips: [
            "글·댓글·채팅이 보이는 화면을 작성자 표시와 날짜가 함께 보이게 저장해요.",
            "게시물 주소(URL)와 본 날짜·시각을 따로 적어 두어요.",
            "지워지기 전에 남기고, 게임은 신고 기능으로 대화 기록을 함께 남겨요.",
          ],
          starter: "온라인에 저를 비방하는 글이 올라왔어요. 증거는 어떻게 남겨야 하나요? ",
        },
        {
          key: "where",
          label: "알릴 곳",
          tips: [
            "수사를 원하면 경찰청 사이버범죄 신고시스템이나 경찰서에 신고·고소할 수 있어요.",
            "글을 내리게 하고 싶다면 그 서비스의 신고 기능이나 방송미디어통신심의위원회 심의 신청을 알아봐요.",
            "성적 괴롭힘 피해는 디지털 성범죄 피해 지원 기관에서 상담을 받을 수 있어요.",
          ],
          starter: "게시글을 지우게 하려면 어디에 요청해야 하나요? ",
        },
        {
          key: "which",
          label: "어떤 일인지",
          tips: [
            "사실을 드러내 평판을 떨어뜨렸는지, 욕설·비하였는지에 따라 관련 조문이 달라요.",
            "성적인 말·사진을 보내 온 경우는 통신매체이용음란 조문과 관련이 있어요.",
          ],
          starter: "모르는 사람이 메신저로 성적인 말을 계속 보내요. ",
        },
      ],
    },
  },
  market: {
    id: "market",
    name: "중고천국",
    tagline: "중고나라·번개장터 등 온라인 거래에서 발생한 사기 사건을 중심으로 다룸",
    subtitle: "온라인 중고거래 사기 피해, 할 일을 순서대로",
    href: "/assistants/market",
    sections: ["fraud", "consumer", "privacy"],
    caseHint: "사기 편취",
    lawHints: [
      { lawName: "형법", articleNos: ["제347조"] },
      { lawName: "민법", articleNos: ["제750조"] },
    ],
    persona: `<비서>
이름: 중고천국 (햄찌법원 분야별 비서, AI)
분야: 온라인 중고거래·개인 간 거래에서 돈을 보냈는데 물건이 오지 않거나, 다른 물건이 오거나, 연락이 끊긴 사기 피해.
중점: 피해를 본 쪽에서 거래 기록을 정리하고 신고·고소, 돈을 돌려받는 민사 절차(손해배상, 형사 절차의 배상명령 등 근거에 있는 제도)를 근거로 설명합니다. 송금한 은행에 할 수 있는 조치는 근거 목록에 있는 제도만 말합니다.
${COMMON_PERSONA}
</비서>`,
    starters: [
      "중고거래로 물건값을 먼저 보냈는데 판매자가 물건을 안 보내고 연락이 끊겼어요. 어떻게 해야 하나요?",
      "중고거래 앱에서 산 휴대폰이 설명과 다르게 고장 난 물건이 왔어요. ",
      "안전결제라며 판매자가 보낸 링크로 결제했는데 돈만 빠져나갔어요. ",
    ],
    disclaimer:
      "중고나라·번개장터는 온라인 중고거래가 이루어지는 곳의 예로 든 이름이에요. 햄찌법원은 이 서비스들과 관계가 없어요.",
    greeting:
      "안녕하세요, 중고천국이에요. 어디서 어떻게 거래했고 돈을 어떻게 보냈는지 적어 주세요. 계좌번호·연락처는 빼고 적어 주세요.",
    panel: {
      title: "지금 할 일 순서",
      groups: [
        {
          key: "record",
          label: "기록 모으기",
          tips: [
            "거래 글, 대화 내용, 송금 내역을 날짜가 보이게 저장해요.",
            "상대방의 닉네임·거래 글 주소도 함께 적어 두어요.",
          ],
          starter: "중고거래 사기를 당했는데 무엇부터 모아야 하나요? ",
        },
        {
          key: "bank",
          label: "은행에 알리기",
          tips: [
            "돈을 보낸 은행에 사기 피해를 알리고 할 수 있는 조치를 물어봐요.",
            "보이스피싱과 달리 물건 거래를 가장한 사기는 계좌 지급정지를 정한 특별법의 대상에서 빠져 있어요.",
            "결제 링크로 돈이 빠져나갔다면 결제한 곳에도 바로 알려요.",
          ],
          starter: "중고거래로 판매자에게 보낸 돈을 은행에 알리면 어떤 조치가 있나요? ",
        },
        {
          key: "report",
          label: "신고하기",
          tips: [
            "경찰청 사이버범죄 신고시스템이나 경찰서에 신고·고소할 수 있어요.",
            "거래한 플랫폼의 신고 기능으로도 알려 두어요.",
          ],
          starter: "중고거래 사기를 경찰에 신고하려면 어떻게 해야 하나요? ",
        },
        {
          key: "recover",
          label: "돌려받기",
          tips: [
            "형사 재판에서 배상명령을 신청하거나, 따로 민사 절차로 돌려받기를 청구하는 방법이 있어요.",
          ],
          starter: "사기당한 돈을 돌려받으려면 어떤 절차가 있나요? ",
        },
      ],
    },
  },
};

/** 소개 문구에 실제 서비스 이름이 나오는 곳(홈·목록 카드, 비서 머리, 안내 챗봇 고르기)에 함께 보이는 안내 */
export const SERVICE_NAMES_NOTICE =
  "중고나라·번개장터·유튜브·게임 같은 이름은 예로 든 것이고, 햄찌법원은 그 서비스들과 관계가 없어요.";

export const ASSISTANT_LIST: Assistant[] = ASSISTANT_IDS.map((id) => ASSISTANTS[id]);

/** 이 비서가 주로 다루는 섹션인가. 섹션을 모르면(해석 없음) 분야 안으로 본다 */
export function inScope(id: AssistantId, section: SectionLabel | null | undefined): boolean {
  if (!section || section === "none") return true;
  return ASSISTANTS[id].sections.includes(section);
}
