// 판독기 개발 묶음 (DEC-048) — 낱말 사전을 고칠 때 보는 질문. 개발 세션이 직접 쓴 가상 사연이고 실제 글이 아니다.
// 정답 묶음(evals/labels/eval-set.jsonl)과 겹치지 않게 다른 표현으로 썼다. label은 기준 답, others는 받아들이는 다른 답.
export type DevCase = { q: string; label: string; others?: string[] };

export const DEV_CASES: DevCase[] = [
  // 임대차
  {
    q: "월세 계약 끝나서 이사 나왔는데 보증금 500 중에 200만 주고 나머지는 다음 세입자 들어오면 준대요",
    label: "lease_deposit",
  },
  {
    q: "전세 사는 집이 경매로 넘어갔다는 우편이 왔어요 보증금은 어떻게 되나요",
    label: "lease_deposit",
  },
  {
    q: "집주인이 실거주한다고 갱신 안 해준대요 근데 다른 사람한테 세 놓은 것 같아요",
    label: "lease_residence",
  },
  { q: "새 집주인이 월세를 갑자기 오십 올리겠다는데 따라야 하나요", label: "lease_residence" },
  {
    q: "원룸 가계약금 50만원 보냈는데 다음날 마음 바뀌어서 취소하면 돌려받나요",
    label: "contract_deposit",
  },
  {
    q: "아파트 매매 계약하고 계약금 넣었는데 매도인이 집값 올랐다고 계약 깨재요",
    label: "contract_deposit",
  },
  { q: "카페 하는 상가인데 건물주가 재건축한다고 나가래요 권리금은요", label: "commercial_lease" },
  // 노동
  {
    q: "편의점 알바 석 달 했는데 마지막 월급을 아직도 안 줘요 사장이 연락도 안 받음",
    label: "wage",
  },
  { q: "1년 넘게 일하고 퇴사했는데 퇴직금 없다고 합니다 5인 미만 사업장이라서요", label: "wage" },
  { q: "회사에서 문자로 내일부터 출근하지 말라고 통보했어요 이유도 안 알려줌", label: "dismissal" },
  { q: "권고사직 하라고 계속 압박하는데 안 쓰면 해고한대요", label: "dismissal" },
  {
    q: "과장이 회의 때마다 저만 찍어서 소리 지르고 모욕을 줘요 녹음해둠",
    label: "workplace_harassment",
    others: ["insult"],
  },
  { q: "배달하다가 넘어져서 손목 골절됐는데 산재 되나요", label: "industrial_accident" },
  {
    q: "창고에서 박스 나르다 허리 디스크 터졌어요 회사는 개인 질병이래요",
    label: "industrial_accident",
  },
  // 거래·돈
  { q: "번개장터에서 닌텐도 산다고 30만원 보냈는데 판매자가 차단했어요", label: "fraud" },
  {
    q: "친구한테 300 빌려줬는데 1년째 다음 달에 준다고만 해요 차용증은 없고 카톡만 있음",
    label: "money",
  },
  { q: "인테리어 공사 다 해줬는데 잔금 천만원을 안 줘요", label: "money" },
  { q: "헬스장 1년권 끊었는데 이사 가서 환불 요청하니 위약금을 너무 많이 떼요", label: "consumer" },
  { q: "인터넷 쇼핑몰에서 산 패딩이 불량인데 반품을 안 받아줘요", label: "consumer" },
  {
    q: "실손보험 청구했더니 보험사가 지급을 거절했어요 이유가 이해가 안 가요",
    label: "insurance_claim",
  },
  // 교통·이웃
  {
    q: "주차장에서 후진하던 차가 제 차 문을 긁고 갔는데 보험 처리를 안 해준대요",
    label: "traffic",
  },
  { q: "횡단보도 건너다 차에 부딪혀서 입원했어요 합의금은 어떻게 정하나요", label: "traffic" },
  { q: "윗집 발망치 소리 때문에 잠을 못 자요 관리실에 말해도 안 바뀜", label: "neighbor" },
  { q: "옆집 개한테 우리 아이가 물렸어요 치료비 받을 수 있나요", label: "neighbor" },
  // 가족·상속
  { q: "남편이 바람피워서 이혼하려는데 아이 양육권 가져올 수 있을까요", label: "family" },
  { q: "이혼할 때 양육비 매달 주기로 했는데 반년째 안 보내요", label: "family" },
  { q: "엄마가 돌아가셨는데 빚이 더 많은 것 같아요 상속포기 해야 하나요", label: "inheritance" },
  { q: "할아버지 유언장이 나왔는데 장남한테만 다 준다고 되어 있어요", label: "inheritance" },
  // 말·글
  { q: "단톡방에서 동창이 제가 돈 떼먹었다고 거짓말을 퍼뜨렸어요", label: "defamation" },
  { q: "유튜브 댓글에 제 실명 거론하면서 욕하는 사람 고소 가능한가요", label: "defamation" },
  { q: "가게 손님이 다른 손님들 있는데서 저한테 쌍욕을 했어요 모욕죄 되나요", label: "insult" },
  // 범죄 피해
  { q: "술집에서 모르는 사람한테 주먹으로 맞아서 코뼈가 부러졌어요", label: "assault" },
  { q: "헤어진 남친이 매일 밤 집 앞에 와서 서성여요 무서워요", label: "stalking" },
  {
    q: "회식 후 택시에서 상사가 제 허벅지를 만졌어요",
    label: "sex_crime",
    others: ["workplace_harassment"],
  },
  { q: "아빠가 술만 마시면 엄마랑 저를 때려요 어디에 신고해야 하나요", label: "domestic_violence" },
  { q: "중학생 아들이 반 애들한테 돈 뺏기고 맞고 다녔대요", label: "school_violence" },
  { q: "검찰이라고 전화 와서 계좌가 범죄에 쓰였다고 해서 돈을 보냈어요", label: "voice_phishing" },
  {
    q: "엄마 나 폰 액정 깨졌어 문자 받고 상품권 사서 보냈는데 사기였어요",
    label: "voice_phishing",
  },
  { q: "자전거를 아파트 거치대에 뒀는데 누가 훔쳐갔어요 cctv에 찍혔대요", label: "crime_report" },
  { q: "동업자가 회사 돈을 몰래 빼서 썼어요 횡령으로 고소하려고요", label: "crime_report" },
  { q: "쇼핑몰 해킹으로 제 개인정보가 유출됐다는 안내 문자를 받았어요", label: "privacy" },
  { q: "누가 제 명의로 휴대폰을 개통해서 요금이 청구됐어요", label: "privacy" },
  { q: "제가 찍은 사진을 어떤 업체가 허락 없이 광고에 쓰고 있어요", label: "copyright" },
  {
    q: "성형외과에서 코 수술 받았는데 염증이 생겨 재수술 해야 한대요 병원 책임 물을 수 있나요",
    label: "medical",
  },
  // 행정·세금·복지
  { q: "음주운전으로 면허 취소됐는데 생계 때문에 행정심판 하고 싶어요", label: "admin_appeal" },
  { q: "식당에 영업정지 2개월 처분이 나왔어요 너무 과한 것 같아요", label: "admin_appeal" },
  {
    q: "실업급여 신청했는데 자발적 퇴사라고 안 된대요 이의신청 방법 알려주세요",
    label: "welfare_appeal",
  },
  { q: "기초연금이 갑자기 중지됐다는 통지가 왔어요", label: "welfare_appeal" },
  { q: "종합소득세 신고를 늦게 해서 가산세가 나왔어요 줄일 방법이 있나요", label: "tax_appeal" },
  { q: "부모님께 집을 증여받으려는데 증여세는 얼마나 나오나요", label: "tax_appeal" },
  { q: "주정차 위반 과태료가 나왔는데 그때 차를 판 뒤였어요", label: "fine_objection" },
  // 부동산 절차
  { q: "법원 경매로 빌라를 사보려는데 입찰은 어떻게 하나요", label: "auction" },
  { q: "아파트 잔금 치르고 소유권이전등기를 제가 직접 할 수 있나요", label: "registration" },
  {
    q: "구축 아파트 샀는데 입주하고 보니 베란다에 누수랑 곰팡이가 심해요 전 주인한테 책임 물을 수 있나요",
    label: "property_defect",
  },
  { q: "스마트스토어에서 수제 잼을 팔려면 무슨 신고를 해야 하나요", label: "business_permit" },
  // 빚
  { q: "카드값이랑 대출이 감당이 안 돼요 개인회생 하면 어떻게 되나요", label: "debt_relief" },
  { q: "대부업체에서 매일 추심 전화가 와서 미치겠어요", label: "debt_relief" },
  // 받는 쪽
  { q: "법원에서 지급명령 정본이라는 게 날아왔어요 어떻게 해야 하나요", label: "respond_civil" },
  { q: "전 직장에서 저를 상대로 손해배상 소송을 걸었대요 소장 받았어요", label: "respond_civil" },
  {
    q: "술 먹고 싸워서 상대가 저를 폭행으로 고소했대요 경찰서에서 출석하래요",
    label: "respond_criminal",
  },
  { q: "제가 단톡에 쓴 글 때문에 명예훼손으로 고소당했어요", label: "respond_criminal" },
  { q: "편의점에서 실수로 물건을 들고 나왔는데 절도로 신고당했어요", label: "respond_criminal" },
  // 군
  { q: "자대에서 허리를 다쳤는데 의병전역 심사 받을 수 있나요", label: "military_discharge" },
  { q: "휴가 나왔다가 복귀를 못 해서 군사경찰한테 연락 왔어요", label: "military_criminal" },
  { q: "분대장이 매일 얼차려 주고 욕해요 어디에 신고하나요", label: "military_abuse" },
  // 갚아야 하는 쪽·범위 밖
  { q: "친구한테 빌린 돈을 아직 못 갚았는데 친구가 갚으래요 언제까지 줘야 하나요", label: "none" },
  { q: "세입자가 계약 끝났는데 보증금을 지금 당장 달래요 저도 돈이 없는데", label: "none" },
  // 상대의 요구를 전하는 꼴 (2026-11-20 앱 확인에서 찾은 빈틈)
  { q: "세입자가 보증금 돌려달라고 하는데 저도 돈이 없어요 어떻게 해야 하나요", label: "none" },
  { q: "그만둔 알바생이 주휴수당까지 달라고 하는데 꼭 줘야 하나요", label: "none" },
  { q: "친구가 예전에 빌려준 돈 갚으라고 독촉해요 지금은 형편이 안 돼요", label: "none" },
  // 내가 요구하는 꼴은 그대로 (뒤집히지 않아야 함)
  { q: "집주인한테 보증금 돌려달라고 하는데 새 세입자 들어오면 준대요", label: "lease_deposit" },
  { q: "사장님께 밀린 월급 달라고 하는데 다음 달에 준다고만 해요", label: "wage" },
  { q: "법 공부 처음 하는데 민법이랑 형법 차이가 뭔가요", label: "none" },
  { q: "판사는 어떻게 되는 건가요 궁금해서요", label: "none" },
  { q: "만약 무인도에서 사람이 살면 어느 나라 법을 따라요", label: "none" },
];
