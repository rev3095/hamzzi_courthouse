// 절차 섹션 라벨 (DEC-033). 라이트 답변 호출이 질문을 읽고 이 목록에서 하나만 고른다 — 타임라인 단계 문구는
// 여전히 고정 문안(steps·life-tracks·more-tracks)이고, 모델은 어느 섹션인지만 정한다. 목록 밖 값은 버린다.
// 순수 모듈: lib/ai(프롬프트·스키마)와 lib/procedure/policy(타임라인 선택)가 함께 쓴다.
import type { LifeTrackKey } from "./life-tracks";
import type { TrackKey } from "./steps";

export type SectionLabel = TrackKey | LifeTrackKey | "none";

/** 라벨마다 모델에 보여 줄 한 줄 설명. 키 순서가 스키마 enum 순서다 */
export const SECTION_GUIDE: Record<SectionLabel, string> = {
  lease_deposit: "주택 임대차 보증금·전세금을 돌려받지 못함",
  lease_residence: "주택 임대차에서 계속 살 수 있는지·계약 갱신·퇴거 요구 분쟁",
  contract_deposit: "계약금·가계약금을 돌려받는 문제",
  wage: "임금·퇴직금·수당을 받지 못함",
  dismissal: "해고가 부당하다고 다투는 문제 (못 받은 임금이 중심이면 wage)",
  fraud: "거래 사기 피해 (중고거래 등에서 돈을 보냈는데 물건·연락이 없음)",
  traffic: "교통사고 피해의 손해배상",
  neighbor: "이웃 간 피해 (층간소음, 반려동물, 누수 등)",
  money: "빌려준 돈·물건값 등 돈을 돌려받는 일반 민사 문제",
  family: "이혼·양육비·양육권·재산분할",
  inheritance: "상속·유산·유류분·상속 포기",
  consumer: "구매한 상품·서비스의 환불·청약철회 등 소비자 피해",
  defamation:
    "온라인 글·댓글·메신저·문자로 당한 명예훼손·모욕 (게시물이나 메시지가 남아 있는 경우)",
  insult: "직접 만난 자리·전화 등 말이나 행동으로 당한 욕설·모욕·명예훼손 (온라인 글이 아님)",
  crime_report: "위에 없는 범죄 피해를 고소·신고하려는 경우 (절도·횡령·재물손괴 등)",
  assault: "맞거나 다친 폭행·상해 피해",
  stalking: "반복되는 연락·접근(스토킹)과 그에 따른 협박 피해",
  sex_crime: "성폭력·성추행·불법 촬영 등 성범죄 피해",
  domestic_violence: "배우자·부모 등 가족에게 당한 폭력",
  school_violence: "학생이 당한 학교폭력",
  voice_phishing: "보이스피싱·스미싱·기관 사칭에 속아 돈을 보낸 금융사기",
  workplace_harassment: "직장 내 괴롭힘 (상사·동료의 괴롭힘, 따돌림)",
  industrial_accident: "일하다 다치거나 병이 생긴 산재 보상",
  medical: "진료·수술 뒤 피해가 생긴 의료사고",
  privacy: "개인정보 유출·명의 도용 피해",
  commercial_lease: "상가 임대차의 갱신·권리금·임대료·퇴거 분쟁 (상가 보증금만 못 받았으면 money)",
  admin_appeal:
    "영업정지·면허 취소·과징금 같은 행정처분에 불복하려는 경우 (과태료·불기소 처분은 아님)",
  debt_relief: "빚을 갚기 어려워 채무조정·개인회생·파산을 알아보는 경우",
  respond_civil: "소장·지급명령 같은 법원 서류를 받은 쪽 (민사 청구를 당함)",
  respond_criminal: "고소·신고를 당했거나 수사를 받는 쪽",
  auction:
    "부동산 경매·공매에 입찰해 사려는 경우 (물건 확인·권리분석·입찰·대금 납부). 살던 집이 경매에 넘어간 임차인은 lease_deposit",
  registration:
    "부동산 등기를 신청하려는 경우 (소유권이전등기·가등기 등). 임차권등기명령은 lease_deposit",
  fine_objection: "과태료를 통지받거나 부과받아 이의를 제기하려는 경우",
  business_permit: "영업신고·영업허가처럼 가게를 열 때 필요한 인허가 절차를 알아보는 경우",
  insurance_claim:
    "보험사가 보험금 지급을 거절하거나 줄인 경우 (고지의무 위반 주장 등). 교통사고 과실 다툼은 traffic",
  copyright: "내 창작물(글·그림·사진·영상 등)이 허락 없이 쓰인 저작권 침해 피해",
  none: "위 어디에도 맞지 않거나 알 수 없음. 돈을 갚아야 하는 쪽인데 서류는 받지 않았을 때도 none",
};

export const SECTION_LABELS = Object.keys(SECTION_GUIDE) as SectionLabel[];

/** 프롬프트에 넣는 라벨 목록 (고정 문자열 — 프롬프트 캐시가 깨지지 않게 요청마다 같다) */
export const SECTION_GUIDE_TEXT = SECTION_LABELS.map((k) => `  ${k}: ${SECTION_GUIDE[k]}`).join(
  "\n",
);

/** 목록에 있는 라벨만 통과시킨다. 그 밖(없음·오타·다른 타입)은 null */
export function parseSectionLabel(value: unknown): SectionLabel | null {
  return typeof value === "string" && (SECTION_LABELS as string[]).includes(value)
    ? (value as SectionLabel)
    : null;
}
