// F-007 사용자 입력 PII 탐지·마스킹. 원문은 이 함수 안(요청 메모리)에서만 다루고 반환하지 않는다 (DEC-006).
// 결과에는 마스킹본과 유형별 개수만 담는다. 일치한 값은 어디에도 남기지 않는다.
// 재현율 우선: 애매하면 가린다. 사용자는 마스킹본을 확인·수정할 수 있다 (pii-confirmation).

export type PiiType = "name" | "phone" | "rrn" | "account" | "email" | "address";
export type PiiFinding = { type: PiiType; count: number };

const TOKEN: Record<Exclude<PiiType, "name">, string> = {
  rrn: "[주민번호]",
  phone: "[전화번호]",
  account: "[계좌번호]",
  email: "[이메일]",
  address: "[주소]",
};

// 숫자 패턴은 긴 것·특수한 것부터 가린다 (주민번호 → 전화 → 계좌)
const NUMERIC: [Exclude<PiiType, "name">, RegExp][] = [
  // 뒷자리 일부를 *로 가린 형태도 포함
  ["rrn", /(?<!\d)\d{6}\s?-\s?[1-8][\d*]{6}(?!\d)/g],
  ["phone", /(?<!\d)01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g],
  ["phone", /(?<!\d)0(?:2|[3-6]\d|70)[-.)\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g],
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  // 계좌·카드: 하이픈으로 묶인 숫자 3~5묶음, 숫자 합 10~16자리 (날짜 2025-10-19 = 8자리는 제외)
  ["account", /(?<![\d-])\d{2,6}(?:-\d{2,6}){2,4}(?![\d-])/g],
  // 계좌 문맥 뒤의 연속 숫자 10~16자리
  ["account", /(?<=(?:계좌|통장|은행|뱅크|입금|송금|이체)[^\d\n]{0,15})\d{10,16}(?!\d)/g],
  ["address", /[가-힣]+(?:시|도)\s+[가-힣]+(?:시|군|구)\s+[가-힣0-9]+(?:로|길)\s*\d+(?:-\d+)?/g],
  ["address", /[가-힣]+(?:동|리)\s*\d+(?:-\d+)?\s*번지/g],
  ["address", /(?<!\d)\d{1,4}\s?동\s?\d{1,4}\s?호(?![가-힣])/g],
];

const digitCount = (s: string) => s.replace(/\D/g, "").length;

// --- 이름 ---------------------------------------------------------------
// 수집기(collector/deid.py)와 같은 성씨 목록. 오탐이 잦은 한 글자 성(국·경·도·소 등)은 뺐다.
const SURNAMES =
  "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채";
// 성씨 글자로 시작하지만 이름이 아닌 말
const NOT_NAMES = new Set(
  (
    "고객 회원 주인 차장 지점장 전무 조장 강사 고문 신부 주임 이사 이사장 이웃 전부 전원 이상 이하 이름 " +
    "주장 정부 조합 한국 남편 신청 주소 주택 조치 정도 서면 신분 고소 고발 하자 진술 차량 주의 지위 지급 " +
    "성명 명의 우선 손해 임대인 임차인 차주 전세 조사 장소 신고 임대 임차 부동산 소송 소장 정당 이익 지정 " +
    "지시 안내 전체 서류 서명 사이 사망 사건 구청 구청장 시장 장관 한도 한편 주위 공사 공단 회사 법인 학교 " +
    "병원 은행 보험사 경찰 검찰 법원 판사 검사 변호사 노무사 법무사 세무사 상대방 상대 사장 대표 직원 " +
    "선생 선배 후배 친구 동생 형님 누나 언니 오빠 아빠 엄마 남친 여친 전남친 전여친 이번 이전 이후 정말 진짜 " +
    "한번 한달 오늘 어제 내일 지금 나중 전화 문자 계약 계약금 보증금 월세 임금 월급 퇴직금 사기 고소장 " +
    "지난 지난달 작년 올해 이미 아직 우리 저희 그쪽 이쪽 하루 일단 유리 불리 피해 피해자 가해자"
  ).split(" "),
);
// 이름 뒤에 붙는 말(호칭·조사). 긴 것부터 떼어 본다.
const NAME_TAILS = [
  "에게서", "한테서", "에게", "한테", "께서", "이랑", "하고", "으로", "에서", "과의", "와의",
  "이가", "이는", "이를", "이한테", "이에게", "은", "는", "이", "가", "의", "에", "도", "를", "을",
  "과", "와", "랑", "로", "씨", "님", "이에요", "예요", "입니다", "이고", "이며",
].sort((a, b) => b.length - a.length); // prettier-ignore
const HONORIFIC = "씨|님|군|양|선생님|사장님|대표님|과장님|부장님|팀장님|대리님|실장님|기사님";
// 바로 뒤에 이름이 오기 쉬운 관계·역할어
const RELATIONS =
  "친구|남편|아내|와이프|동생|형|누나|언니|오빠|사장|집주인|임대인|임차인|세입자|상대방|판매자|구매자|" +
  "상사|동료|남자친구|여자친구|전남친|전여친|채무자|채권자|가해자|피해자|원고|피고|고소인|피고소인|직원|대표";

const isNameCandidate = (s: string) =>
  s.length >= 2 && s.length <= 4 && SURNAMES.includes(s[0]) && !NOT_NAMES.has(s);

/** '김지은은' 같은 낱말에서 조사·호칭을 떼고 이름으로 보이는 부분을 고른다. */
function nameStem(token: string): string | null {
  if (NOT_NAMES.has(token)) return null;
  for (const tail of NAME_TAILS) {
    if (token.endsWith(tail) && token.length > tail.length) {
      const stem = token.slice(0, -tail.length);
      if (NOT_NAMES.has(stem)) return null;
      if (isNameCandidate(stem)) return stem;
    }
  }
  return isNameCandidate(token) ? token : null;
}

function findNames(text: string): Set<string> {
  const names = new Set<string>();
  // 1) 이름 + 호칭: "김철수 씨", "이영희님"
  for (const m of text.matchAll(new RegExp(`([가-힣]{2,4})\\s?(?:${HONORIFIC})`, "g"))) {
    if (isNameCandidate(m[1])) names.add(m[1]);
  }
  // 2) 관계·역할어 + 이름: "친구 박민수한테", "집주인 최영호가"
  for (const m of text.matchAll(
    new RegExp(`(?:^|[^가-힣])(?:${RELATIONS})\\s+([가-힣]{2,7})`, "g"),
  )) {
    const stem = nameStem(m[1]);
    if (stem) names.add(stem);
  }
  // 3) 명시: "이름은 홍길동", "성명: 홍길동"
  for (const m of text.matchAll(/(?:이름|성명)\s*(?:은|는|이|:)?\s*([가-힣]{2,7})/g)) {
    const stem = nameStem(m[1]);
    if (stem) names.add(stem);
  }
  return names;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type PiiScan = { maskedText: string; findings: PiiFinding[] };

/** 입력 텍스트를 마스킹한다. 같은 이름은 같은 번호([이름1])로 가려 문장 구조를 남긴다. */
export function maskPii(text: string): PiiScan {
  const counts = new Map<PiiType, number>();
  const bump = (t: PiiType, n = 1) => counts.set(t, (counts.get(t) ?? 0) + n);

  let masked = text;
  for (const [type, re] of NUMERIC) {
    masked = masked.replace(re, (m) => {
      if (type === "account" && !/^\d+$/.test(m) && (digitCount(m) < 10 || digitCount(m) > 16)) {
        return m;
      }
      bump(type);
      return TOKEN[type];
    });
  }

  // 번호는 처음 나온 순서로 매기고, 바꾸기는 긴 이름부터 해서 '김철수'가 '김철'보다 먼저 가려지게 한다
  const found = [...findNames(masked)];
  const firstAt = (n: string) => masked.search(new RegExp(`(?<![가-힣])${escapeRe(n)}`));
  const numbered = new Map(
    [...found].sort((a, b) => firstAt(a) - firstAt(b)).map((n, i) => [n, i + 1]),
  );
  for (const name of found.sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![가-힣])${escapeRe(name)}`, "g");
    masked = masked.replace(re, () => {
      bump("name");
      return `[이름${numbered.get(name)}]`;
    });
  }

  const order: PiiType[] = ["name", "phone", "rrn", "account", "email", "address"];
  const findings = order
    .filter((t) => counts.has(t))
    .map((type) => ({ type, count: counts.get(type)! }));
  return { maskedText: masked, findings };
}
