// 전문 에이전트 아카이브 시나리오 (F-018, DEC-057). 에이전트마다 10개 — 원고(청구·고소하는 쪽) 7 : 피고(받은 쪽) 3.
// 모두 직접 쓴 가상 사연이다(실제 사건·실제 사용자 질문 아님). 이름·연락처는 넣지 않는다.
// 서류 단계는 양쪽을 모두 담는다: 내용증명을 쓸 때·받았을 때, 소장(고소장)을 쓸 때·받았을 때, 그 전의 내용 정리 단계.
// 이 문장이 아카이브의 질문이자 '체험하기' 질문이다 — 바꾸면 tests/live/assistant-archive.live.test.ts로 다시 만든다.
import type { AssistantId } from "./agents";

export type ArchiveSide = "plaintiff" | "defendant";
export type DocStage =
  | "organize" // 내용 정리 (서류 전)
  | "notice_send" // 내용증명 쓰기
  | "notice_receive" // 내용증명 받음
  | "complaint_write" // 소장·고소장·신청서 쓰기
  | "complaint_receive"; // 소장·고소 받음 (출석요구 포함)

export const SIDE_LABEL: Record<ArchiveSide, string> = {
  plaintiff: "원고·고소인 쪽 · 청구·고소하는 쪽",
  defendant: "피고·피고소인 쪽 · 서류를 받은 쪽",
};

export const DOC_STAGE_LABEL: Record<DocStage, string> = {
  organize: "내용 정리 단계",
  notice_send: "내용증명 쓰기",
  notice_receive: "내용증명 받음",
  complaint_write: "소장·고소장 쓰기",
  complaint_receive: "소장·고소 받음",
};

export type ArchiveScenario = {
  id: string;
  assistant: AssistantId;
  side: ArchiveSide;
  stage: DocStage;
  /** 목록 제목 (직접 씀) */
  title: string;
  /** 질문 (가상 사연) */
  question: string;
};

export const ARCHIVE_SCENARIOS: ArchiveScenario[] = [
  // ── 내집마련 (원고 7 · 피고 3) ─────────────────────────────
  {
    id: "home-01",
    assistant: "home",
    side: "plaintiff",
    stage: "notice_send",
    title: "만기 전에 갱신 거절과 보증금 반환을 알리는 내용증명",
    question:
      "전세 계약이 석 달 뒤에 끝나는데 이사를 가려고 해요. 집주인에게 계약을 갱신하지 않겠다고 알리고, 만기일에 보증금을 돌려 달라는 내용증명을 보내려고 합니다. 언제까지 알려야 하고 내용증명에는 무엇을 적어야 하나요?",
  },
  {
    id: "home-02",
    assistant: "home",
    side: "plaintiff",
    stage: "organize",
    title: "만기가 지났는데 보증금을 못 받고 이사해야 할 때",
    question:
      "월세 계약 기간이 지난달 끝났는데 집주인이 새 세입자를 구하지 못했다며 보증금을 안 돌려줘요. 다음 주에 새집으로 이사해야 해서 짐을 빼야 합니다. 이사를 가도 보증금을 지킬 수 있으려면 지금 무엇을 정리하고 어떤 절차를 밟아야 하나요?",
  },
  {
    id: "home-03",
    assistant: "home",
    side: "plaintiff",
    stage: "complaint_write",
    title: "보증금 반환 청구 소장을 직접 쓰려고 할 때",
    question:
      "전세 계약이 끝나고 넉 달이 지났는데도 집주인이 보증금을 돌려주지 않아요. 내용증명도 보냈고 임차권등기도 마쳤어요. 이제 보증금 반환 소송을 하려는데 소장에 무엇을 적고 어떤 증거를 붙여야 하나요? 지급명령과 소송 중 어느 쪽을 먼저 알아봐야 할지도 궁금해요.",
  },
  {
    id: "home-04",
    assistant: "home",
    side: "plaintiff",
    stage: "complaint_write",
    title: "집주인이 세상을 떠난 뒤 상속인에게 보증금을 청구할 때",
    question:
      "살고 있는 집의 집주인이 계약 기간 중에 세상을 떠났어요. 계약이 끝나 보증금을 돌려 달라고 했더니 자녀들이 서로 미루고, 한 명은 상속을 한정승인했다고 해요. 누구를 상대로 어떻게 보증금 반환을 청구해야 하나요?",
  },
  {
    id: "home-05",
    assistant: "home",
    side: "plaintiff",
    stage: "organize",
    title: "전세보증금반환보증 이행을 청구할 때",
    question:
      "전세보증금반환보증에 가입해 두었는데 계약이 끝나도 집주인이 보증금을 돌려주지 않아요. 보증기관에 보증금 지급을 청구하려고 하는데 무엇부터 준비해야 하고, 보증기관이 지급을 늦게 하면 어떻게 되나요?",
  },
  {
    id: "home-06",
    assistant: "home",
    side: "plaintiff",
    stage: "notice_send",
    title: "가계약금을 돌려 달라는 내용증명을 쓸 때",
    question:
      "원룸을 보고 중개사무소 안내로 가계약금 50만 원을 집주인 계좌로 보냈어요. 이틀 뒤 계약을 하지 않겠다고 했더니 가계약금은 돌려줄 수 없다고 합니다. 문자로 정한 건 보증금과 월세 액수뿐이고 입주일은 정하지 않았어요. 돌려 달라는 내용증명을 보내려면 무엇을 적어야 하나요?",
  },
  {
    id: "home-07",
    assistant: "home",
    side: "plaintiff",
    stage: "organize",
    title: "누수를 고쳐 주지 않는 집주인에게 수리를 요구할 때",
    question:
      "월세로 사는 집 천장에서 물이 새서 벽지와 가구가 망가졌어요. 집주인에게 여러 번 알렸는데 고쳐 주지 않아 제가 수리업체를 불러야 할 것 같아요. 수리비를 집주인에게 청구할 수 있는지, 그 전에 어떤 기록을 정리해 두어야 하는지 알고 싶어요.",
  },
  {
    id: "home-08",
    assistant: "home",
    side: "defendant",
    stage: "notice_receive",
    title: "집을 비워 달라는 내용증명을 받았을 때",
    question:
      "전세로 산 지 1년 반이 됐는데 집주인이 집을 팔게 됐다며 계약 기간이 끝나기 전에 집을 비워 달라는 내용증명을 보냈어요. 전입신고와 확정일자는 해 두었어요. 계속 살 수 있는지, 내용증명에 답을 보내야 하는지 궁금해요.",
  },
  {
    id: "home-09",
    assistant: "home",
    side: "defendant",
    stage: "complaint_receive",
    title: "월세 연체로 건물 인도 소장을 받았을 때",
    question:
      "사정이 생겨 월세를 몇 달 밀렸는데 집주인이 계약을 해지한다며 집을 비우고 밀린 월세를 내라는 소장을 법원에서 보내왔어요. 지금은 밀린 월세 일부를 갚을 수 있어요. 소장을 받으면 무엇을 해야 하고 답변서에는 무엇을 적어야 하나요?",
  },
  {
    id: "home-10",
    assistant: "home",
    side: "defendant",
    stage: "complaint_receive",
    title: "원상복구 비용을 보증금에서 빼겠다는 소장을 받았을 때",
    question:
      "이사를 나온 뒤 집주인이 벽지 변색과 바닥 긁힘을 원상복구해야 한다며 그 비용을 보증금에서 빼고, 모자라는 금액을 더 내라는 소장을 보냈어요. 입주할 때 찍어 둔 사진이 있고, 오래 살아서 생긴 자연스러운 낡음이라고 생각해요. 어떻게 대응해야 하나요?",
  },

  // ── 고소미 (원고 7 · 피고 3) ───────────────────────────────
  {
    id: "report-01",
    assistant: "report",
    side: "plaintiff",
    stage: "complaint_write",
    title: "게임 채팅에서 닉네임을 부르며 욕설을 들었을 때 고소장",
    question:
      "온라인 게임에서 같은 편이었던 사람이 전체 채팅으로 제 닉네임을 부르며 심한 욕설을 여러 번 했어요. 그 판에 열 명 가까이 있었고, 제 닉네임은 방송도 해서 아는 사람이 많아요. 모욕으로 고소장을 쓰려면 무엇을 적고 어떤 증거를 내야 하나요?",
  },
  {
    id: "report-02",
    assistant: "report",
    side: "plaintiff",
    stage: "complaint_write",
    title: "공개 커뮤니티에 사실과 다른 글이 올라왔을 때",
    question:
      "동네 공개 커뮤니티에 제가 운영하는 공방이 재료비를 속여 받는다는 글이 올라왔어요. 사실이 아니고 공방 이름과 사진까지 나와 있어요. 글을 내리게 하고 글쓴이를 고소하고 싶어요. 어떤 순서로 무엇을 해야 하나요?",
  },
  {
    id: "report-03",
    assistant: "report",
    side: "plaintiff",
    stage: "complaint_write",
    title: "유튜브 영상에서 나를 알아볼 수 있게 비방했을 때 손해배상",
    question:
      "구독자가 많은 유튜버가 영상에서 제 얼굴을 가리지 않은 사진을 띄우고 제 말투를 흉내 내며 거짓말쟁이라고 비난했어요. 댓글에서 제 학교와 동네까지 알려졌어요. 형사 고소와 함께 위자료를 청구하는 소장을 쓰려면 무엇을 준비해야 하나요?",
  },
  {
    id: "report-04",
    assistant: "report",
    side: "plaintiff",
    stage: "complaint_write",
    title: "모르는 사람이 메시지로 성적인 말을 계속 보낼 때",
    question:
      "SNS 계정으로 모르는 사람이 성적인 말과 사진을 계속 보내요. 차단하면 다른 계정으로 다시 보내고, 제 게시물에도 비슷한 댓글을 달아요. 이걸로 고소할 수 있는지, 고소장에는 무엇을 적어야 하고 증거는 어떻게 남겨야 하나요?",
  },
  {
    id: "report-05",
    assistant: "report",
    side: "plaintiff",
    stage: "notice_send",
    title: "단체 대화방에서 망신을 준 사람에게 사과·삭제를 요구할 때",
    question:
      "동호회 단체 대화방에서 한 회원이 제가 회비를 빼돌렸다는 말을 퍼뜨렸어요. 사실이 아니고 대화방에는 서른 명 정도 있어요. 바로 고소하기보다 먼저 사과와 글 삭제를 요구하는 내용증명을 보내고 싶은데 무엇을 적어야 하나요?",
  },
  {
    id: "report-06",
    assistant: "report",
    side: "plaintiff",
    stage: "organize",
    title: "내 사진과 개인정보가 커뮤니티에 퍼졌을 때",
    question:
      "예전에 다툰 사람이 익명 커뮤니티에 제 사진과 다니는 회사 이름, 사는 동네를 올리고 조롱하는 글을 썼어요. 글이 여기저기 퍼지고 있어요. 먼저 글을 지우게 하고, 그 다음 법적으로 대응하려면 지금 무엇을 정리해 두어야 하나요?",
  },
  {
    id: "report-07",
    assistant: "report",
    side: "plaintiff",
    stage: "complaint_write",
    title: "고소한 사건이 재판으로 넘어간 뒤 손해배상을 받으려 할 때",
    question:
      "온라인에서 저를 계속 비방한 사람을 고소했는데 검찰에서 기소되어 형사 재판이 열린다는 연락을 받았어요. 정신과 치료도 받았어요. 형사 재판에서 배상명령을 신청하는 것과 따로 민사 소장을 내는 것 중 무엇이 나은지, 각각 무엇을 준비해야 하나요?",
  },
  {
    id: "report-08",
    assistant: "report",
    side: "defendant",
    stage: "complaint_receive",
    title: "솔직한 후기를 썼다가 명예훼손으로 고소당했을 때",
    question:
      "다녀온 식당에서 위생이 불량했던 일을 사진과 함께 리뷰로 올렸어요. 사장님이 명예훼손으로 고소했다며 경찰서에서 출석하라는 연락이 왔어요. 리뷰 내용은 제가 직접 겪은 사실이에요. 조사 전에 무엇을 정리하고 준비해야 하나요?",
  },
  {
    id: "report-09",
    assistant: "report",
    side: "defendant",
    stage: "complaint_receive",
    title: "게임 채팅 욕설로 위자료 청구 소장을 받았을 때",
    question:
      "게임을 하다 화가 나서 상대에게 욕을 한 적이 있는데, 그 사람이 위자료를 달라는 민사 소장을 보냈어요. 형사 고소는 아직 없다고 해요. 소장을 받으면 언제까지 무엇을 해야 하고, 답변서에는 무엇을 적어야 하나요? 합의도 생각하고 있어요.",
  },
  {
    id: "report-10",
    assistant: "report",
    side: "defendant",
    stage: "notice_receive",
    title: "게시글을 지우지 않으면 고소하겠다는 내용증명을 받았을 때",
    question:
      "아파트 입주민 카페에 관리업체가 공사비를 부풀린 것 같다는 의견 글을 올렸는데, 관리업체가 글을 지우고 사과하지 않으면 명예훼손으로 고소하겠다는 내용증명을 보냈어요. 글에는 공개된 관리비 내역을 근거로 적었어요. 어떻게 대응해야 하나요?",
  },

  // ── 중고천국 (원고 7 · 피고 3) ─────────────────────────────
  {
    id: "market-01",
    assistant: "market",
    side: "plaintiff",
    stage: "complaint_write",
    title: "돈을 먼저 보냈는데 판매자가 연락을 끊었을 때 고소장",
    question:
      "중고거래 앱에서 태블릿을 사기로 하고 판매자 계좌로 45만 원을 먼저 보냈어요. 택배로 보내 준다더니 그 뒤로 연락이 끊기고 판매 글도 지워졌어요. 사기로 고소장을 쓰려면 무엇을 적고 어떤 자료를 붙여야 하나요?",
  },
  {
    id: "market-02",
    assistant: "market",
    side: "plaintiff",
    stage: "organize",
    title: "같은 판매자에게 여러 사람이 당했을 때",
    question:
      "중고거래 사기를 당하고 사기 피해 정보 공유 게시판을 찾아보니 같은 계좌로 피해를 본 사람이 여러 명 있었어요. 피해자끼리 함께 고소하거나 돈을 돌려받는 절차를 같이 밟을 수 있나요? 지금 무엇을 모아 두어야 하나요?",
  },
  {
    id: "market-03",
    assistant: "market",
    side: "plaintiff",
    stage: "organize",
    title: "판매자가 보낸 가짜 안전결제 링크로 결제했을 때",
    question:
      "중고거래 판매자가 안전결제를 하자며 링크를 보내 줘서 카드로 결제했는데, 알고 보니 거래 앱과 비슷하게 만든 가짜 사이트였어요. 물건은 오지 않았고 판매자 계정도 사라졌어요. 카드사와 경찰에 각각 무엇을 알려야 하나요?",
  },
  {
    id: "market-04",
    assistant: "market",
    side: "plaintiff",
    stage: "notice_send",
    title: "설명과 다른 고장 난 물건을 받고 환불을 요구할 때",
    question:
      "중고로 '정상 작동, 하자 없음'이라는 노트북을 샀는데 받아 보니 화면에 줄이 가고 배터리가 부풀어 있었어요. 판매자는 보낼 때는 멀쩡했다며 환불을 거절해요. 판매자 연락처와 주소는 알아요. 환불을 요구하는 내용증명에는 무엇을 적어야 하나요?",
  },
  {
    id: "market-05",
    assistant: "market",
    side: "plaintiff",
    stage: "complaint_write",
    title: "판매자 신원을 알 때 소액 반환 청구 소장 쓰기",
    question:
      "중고 자전거 대금 80만 원을 보냈는데 판매자가 물건을 보내지 않고 돈도 돌려주지 않아요. 판매자 이름과 주소는 거래할 때 받아 두었어요. 형사 고소와 별도로 돈을 돌려받는 민사 소송을 하고 싶은데 소장은 어떻게 쓰고 어디에 내야 하나요?",
  },
  {
    id: "market-06",
    assistant: "market",
    side: "plaintiff",
    stage: "complaint_write",
    title: "돈을 보낸 계좌의 명의인이 판매자와 다른 사람일 때",
    question:
      "중고거래 사기를 당했는데 돈을 보낸 계좌의 주인이 판매자와 다른 사람이었어요. 경찰은 판매자를 아직 못 찾았다고 해요. 계좌 주인에게 돈을 돌려 달라고 청구할 수 있는지, 그렇다면 소장에 무엇을 적어야 하나요?",
  },
  {
    id: "market-07",
    assistant: "market",
    side: "plaintiff",
    stage: "complaint_write",
    title: "판매자가 기소된 뒤 배상명령을 신청하려 할 때",
    question:
      "중고거래 사기로 고소한 판매자가 기소되어 형사 재판이 열린다는 통지를 받았어요. 피해 금액을 돌려받고 싶은데 형사 재판에서 배상명령을 신청할 수 있다고 들었어요. 신청서는 언제 어디에 내고 무엇을 적어야 하나요?",
  },
  {
    id: "market-08",
    assistant: "market",
    side: "defendant",
    stage: "complaint_receive",
    title: "배송이 늦었을 뿐인데 사기로 고소당했을 때",
    question:
      "중고로 카메라를 팔고 돈을 받았는데 제가 아파서 며칠 동안 택배를 못 보냈어요. 그사이 구매자가 사기라며 경찰에 고소했고, 경찰서에서 조사받으러 오라는 연락이 왔어요. 물건은 이미 보냈고 송장 번호도 있어요. 무엇을 준비해야 하나요?",
  },
  {
    id: "market-09",
    assistant: "market",
    side: "defendant",
    stage: "complaint_receive",
    title: "내 계좌로 들어온 돈 때문에 반환 소장을 받았을 때",
    question:
      "지인 부탁으로 제 계좌로 돈을 받아 전달해 준 적이 있는데, 그 돈이 중고거래 사기 피해금이었다며 피해자가 저에게 돈을 돌려 달라는 소장을 보냈어요. 저는 사기인지 몰랐어요. 소장을 받으면 어떻게 대응해야 하나요?",
  },
  {
    id: "market-10",
    assistant: "market",
    side: "defendant",
    stage: "notice_receive",
    title: "하자를 알렸는데도 환불하라는 내용증명을 받았을 때",
    question:
      "중고 휴대폰을 팔면서 판매 글과 채팅에 배터리 성능이 떨어진다고 분명히 적었어요. 그런데 구매자가 배터리 문제를 이유로 환불하지 않으면 사기로 고소하겠다는 내용증명을 보냈어요. 어떻게 답해야 하나요?",
  },
];

export function scenariosOf(id: AssistantId): ArchiveScenario[] {
  return ARCHIVE_SCENARIOS.filter((s) => s.assistant === id);
}
