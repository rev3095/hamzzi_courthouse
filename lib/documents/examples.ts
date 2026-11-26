// 서식 예시 문서 (사용자 요청 2026-11-26): 가상 인물·가상 사건으로 채운 입력값. 서식 화면의 '예시로 보기'가
// 이 값을 실제 채우기(fillDocument)에 넣어 완성된 문서 모양을 보여 준다 — 모델이 쓴 글이 아니라 직접 쓴 예시다.
// 이름·주소·계좌·사건번호는 모두 지어낸 것이다(햄찌법원 테스트에서 쓰는 가상 이름). 실제 사건·실제 서비스 이름을 쓰지 않는다.
// 예시는 '이렇게 적는다'를 보여 줄 뿐이고, 같은 결과가 나온다는 뜻이 아니다.
import type { DocumentKind } from "@/lib/procedure/steps";

export type DocumentExample = {
  /** 예시 이름 (어떤 상황인지) */
  title: string;
  values: Record<string, string>;
};

export const EXAMPLE_NOTICE =
  "가상 인물과 가상 사건으로 채운 예시예요. 이름·날짜·기한·금액도 모두 지어낸 값이고, 이렇게 쓰면 같은 결과가 난다는 뜻이 아니에요. 내가 겪은 사실대로 적어 주세요.";

const ME = { name: "김햄찌", address: "해바라기시 씨앗구 볍씨로 7", phone: "010-0000-1234" };
const OTHER = { name: "이도토리", address: "도토리시 참나무구 밤길 3" };

export const DOCUMENT_EXAMPLES: Partial<Record<DocumentKind, DocumentExample[]>> = {
  "defamation-complaint": [
    {
      title: "게임 채팅에서 여러 사람이 보는 가운데 욕설을 들은 경우",
      values: {
        complainantName: ME.name,
        complainantAddress: ME.address,
        complainantPhone: ME.phone,
        accusedName: "",
        accusedAddress: "",
        accusedPhone: "",
        accusedSite: "도토리 온라인",
        accusedId: "acorn77",
        incidentDate: "2026-10-12",
        placeType: "game",
        placeDetail: "도토리 온라인 게임 안 팀 채팅",
        howKnown: "saw",
        content:
          "같은 팀 다섯 명이 보는 채팅창에서 제 닉네임 '해씨'를 부르며 부모를 들먹이는 욕설을 여러 번 적었습니다.\n적은 말은 화면 캡처에 그대로 있습니다.",
        truth: "none",
        publicity: "many",
        punish: "yes",
        civil: "no",
        evidenceKinds: "video",
        chkFamily: "no",
        chkKnown: "no",
        chkPointsToMe: "yes",
        chkHarmsImage: "unknown",
        chkPublicPlace: "yes",
        chkOthersKnew: "yes",
        chkAlone: "no",
        chkWithdraw: "unknown",
        chkFiledBefore: "no",
        chkWithdrewBefore: "no",
        pledge: "agree",
        policeStation: "볍씨경찰서",
        writtenOn: "2026-10-20",
      },
    },
    {
      title: "커뮤니티 게시판에 사실이 아닌 글이 올라온 경우",
      values: {
        complainantName: ME.name,
        complainantAddress: ME.address,
        complainantPhone: ME.phone,
        accusedName: "",
        accusedAddress: "",
        accusedPhone: "",
        accusedSite: "볍씨 커뮤니티",
        accusedId: "nut_story",
        incidentDate: "2026-09-28",
        placeType: "internet",
        placeDetail: "볍씨 커뮤니티 자유게시판",
        howKnown: "told",
        content:
          "제 가게 이름과 제 성을 적고 '손님 돈을 떼먹고 도망간 사람'이라고 쓴 글이 올라왔습니다.\n저는 그런 일을 한 적이 없습니다.",
        truth: "false",
        publicity: "many",
        punish: "yes",
        civil: "no",
        evidenceKinds: "video,witness",
        chkFamily: "no",
        chkKnown: "unknown",
        chkPointsToMe: "yes",
        chkHarmsImage: "yes",
        chkPublicPlace: "yes",
        chkOthersKnew: "yes",
        chkAlone: "no",
        chkWithdraw: "unknown",
        chkFiledBefore: "no",
        chkWithdrewBefore: "no",
        pledge: "agree",
        policeStation: "볍씨경찰서",
        writtenOn: "2026-10-05",
      },
    },
  ],
  "trade-fraud-complaint": [
    {
      title: "돈을 보냈는데 물건이 오지 않고 연락이 끊긴 경우",
      values: {
        complainantName: ME.name,
        complainantAddress: ME.address,
        complainantPhone: ME.phone,
        accusedName: "",
        accusedAddress: "",
        accusedPhone: "",
        accusedSite: "도토리장터",
        accusedId: "acorn77",
        accusedAccount: "다람은행 333-22-1111",
        item: "중고 노트북",
        postDate: "2026-09-02",
        said: "오늘 입금하시면 내일 오전에 택배로 보내 드리고 송장 번호를 알려 드릴게요.",
        payDate: "2026-09-03",
        payAmount: "850000",
        after: "none",
        lastContact: "2026-09-05",
        detail:
          "판매 글을 보고 앱 채팅으로 연락했고, 택배 거래를 하기로 했습니다.\n돈을 보낸 뒤 송장 번호를 물었지만 답이 없었고, 며칠 뒤 대화방에서 나간 것으로 표시됐습니다.\n판매 글도 지워져 있었습니다.",
        evidence: "판매 글 캡처\n앱 채팅 캡처\n이체 확인증",
        duplicate: "no",
        relatedCriminal: "unknown",
        relatedCivil: "no",
        pledge: "agree",
        policeStation: "볍씨경찰서",
        writtenOn: "2026-09-10",
      },
    },
  ],
  "obscenity-complaint": [
    {
      title: "모르는 사람이 메신저로 성적인 말을 계속 보낸 경우",
      values: {
        complainantName: ME.name,
        complainantAddress: ME.address,
        complainantPhone: ME.phone,
        accusedName: "",
        accusedAddress: "",
        accusedPhone: "",
        accusedSite: "볍씨톡",
        accusedId: "night_nut",
        incidentDate: "2026-10-01",
        medium: "messenger",
        content:
          "제 몸을 두고 성적인 말을 적은 메시지를 여러 번 보냈습니다.\n적은 말은 화면 캡처에 그대로 있습니다.",
        detail:
          "게임에서 같은 편이었던 사람이 메신저 아이디를 알아내 말을 걸었습니다.\n그만하라고 답한 뒤에도 메시지가 이어졌고, 그 뒤 상대를 차단했습니다.",
        evidence: "받은 메시지 화면 캡처\n앞뒤 대화 캡처\n상대방 계정 화면",
        duplicate: "no",
        relatedCriminal: "no",
        relatedCivil: "no",
        pledge: "agree",
        policeStation: "볍씨경찰서",
        writtenOn: "2026-10-08",
      },
    },
  ],
  answer: [
    {
      title: "물건을 보냈는데 대금 반환 소장을 받은 경우",
      values: {
        court: "해바라기지방법원",
        caseNumber: "2026가소1234",
        plaintiffName: OTHER.name,
        plaintiffAddress: OTHER.address,
        defendantName: ME.name,
        defendantAddress: ME.address,
        defendantPhone: ME.phone,
        stance: "reject",
        aimDetail: "",
        causeAnswer:
          "원고와 중고 노트북 거래를 한 사실, 원고에게서 대금을 받은 사실은 인정합니다.\n물건을 보내지 않았다는 주장은 인정하지 않습니다. 피고는 대금을 받은 다음 날 택배로 물건을 보냈고 배송이 끝난 기록이 있습니다.",
        evidence: "택배 접수증\n배송 조회 화면\n거래 대화 캡처",
        writtenOn: "2026-11-02",
      },
    },
  ],
  "order-objection": [
    {
      title: "지급명령을 받고 다투려는 경우",
      values: {
        court: "해바라기지방법원",
        caseNumber: "2026차1234",
        creditorName: OTHER.name,
        debtorName: ME.name,
        debtorAddress: ME.address,
        debtorPhone: ME.phone,
        servedOn: "2026-11-03",
        writtenOn: "2026-11-06",
      },
    },
  ],
  "decision-objection": [
    {
      title: "이행권고결정을 받고 다투려는 경우",
      values: {
        court: "해바라기지방법원",
        caseNumber: "2026가소5678",
        plaintiffName: OTHER.name,
        defendantName: ME.name,
        defendantPhone: ME.phone,
        servedOn: "2026-11-03",
        writtenOn: "2026-11-06",
      },
    },
  ],
  "demand-letter": [
    {
      title: "커뮤니티 글의 삭제와 손해배상을 요구하는 경우",
      values: {
        subject: "게시물 삭제 및 손해배상 요청",
        senderName: ME.name,
        senderAddress: ME.address,
        recipientName: OTHER.name,
        recipientAddress: OTHER.address,
        facts:
          "귀하는 2026년 9월 28일 볍씨 커뮤니티 자유게시판에 제 가게 이름과 성을 적고 사실이 아닌 내용의 글을 올렸습니다.\n그 글은 지금도 게시판에 남아 있습니다.",
        demand:
          "위 글을 지워 주시기 바랍니다.\n같은 게시판에 바로잡는 글을 올려 주시기 바랍니다.\n위 글로 입은 손해에 대하여 배상하여 주시기 바랍니다.",
        deadline: "이 글을 받으신 날부터 7일 이내",
        writtenOn: "2026-10-05",
      },
    },
    {
      title: "중고거래 대금을 돌려 달라고 요구하는 경우",
      values: {
        subject: "물품 대금 반환 요청",
        senderName: ME.name,
        senderAddress: ME.address,
        recipientName: OTHER.name,
        recipientAddress: OTHER.address,
        facts:
          "본인은 2026년 9월 3일 귀하에게서 중고 노트북을 사기로 하고 850,000원을 보냈습니다.\n귀하는 그 뒤 물건을 보내지 않았습니다.",
        demand: "받은 대금 850,000원을 돌려주시기 바랍니다.",
        deadline: "이 글을 받으신 날부터 10일 이내",
        writtenOn: "2026-09-12",
      },
    },
  ],
  complaint: [
    {
      title: "커뮤니티 글로 입은 손해의 배상을 청구하는 경우",
      values: {
        caseName: "손해배상(기) 청구의 소",
        plaintiffName: ME.name,
        plaintiffAddress: ME.address,
        plaintiffPhone: ME.phone,
        defendantName: OTHER.name,
        defendantAddress: OTHER.address,
        defendantPhone: "",
        claimAmount: "3000000",
        interestRate: "",
        provisional: "yes",
        claimCause:
          "1. 피고는 2026년 9월 28일 볍씨 커뮤니티 자유게시판에 원고의 가게 이름과 성을 적고 사실이 아닌 내용의 글을 올렸습니다.\n2. 그 글은 여러 사람이 볼 수 있는 게시판에 올라와 있었고, 원고는 그 글 때문에 손해를 입었습니다.\n3. 원고는 피고에게 글의 삭제와 배상을 요청했으나 답을 받지 못했습니다.",
        evidence: "갑 제1호증 게시글 화면 캡처\n갑 제2호증 내용증명 사본",
        attachments: "fee,proof,copy",
        court: "해바라기지방법원",
        writtenOn: "2026-11-10",
      },
    },
  ],
};

export function examplesOf(kind: DocumentKind): DocumentExample[] {
  return DOCUMENT_EXAMPLES[kind] ?? [];
}
