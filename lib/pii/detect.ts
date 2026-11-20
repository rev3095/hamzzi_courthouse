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
    "지난 지난달 작년 올해 이미 아직 우리 저희 그쪽 이쪽 하루 일단 유리 불리 피해 피해자 가해자 " +
    // 관계어 뒤에 자주 오는 사건 낱말 (예: "직원 정규직", "남편 이혼", "사장 임금체불")
    "이혼 정규직 비정규직 전입 전출 고용 고용주 이직 구직 구인 지원금 신용 조정 하청 차용 " +
    "차용증 양육 양육비 양육권 임금체불 진단 진단서 진정 진정서 장난 지인"
  ).split(" "),
);
// 이름 뒤에 붙는 말(호칭·조사). 긴 것부터 떼어 본다.
const NAME_TAILS = [
  "에게서", "한테서", "에게", "한테", "께서", "이랑", "하고", "으로", "에서", "과의", "와의",
  "이가", "이는", "이를", "이한테", "이에게", "은", "는", "이", "가", "의", "에", "도", "를", "을",
  "과", "와", "랑", "로", "씨", "님", "이에요", "예요", "입니다", "이고", "이며",
  "이라고", "라고", "이라는", "라는",
  // 한 글자 어미도 떼어 본다: "이름은 김민수고", "가해자 김민수요", "친구 이상윤아"
  "고", "요", "면", "야", "며", "아", "이요", "이야", "이면",
].sort((a, b) => b.length - a.length); // prettier-ignore
const HONORIFIC = "씨|님|선생님|사장님|대표님|과장님|부장님|팀장님|대리님|실장님|기사님";
// 한 글자 호칭 '군'·'양'은 뒤에 조사가 오거나 낱말이 끝날 때만 본다 — "전처가 양육비"의 '양'은 호칭이 아니다
const HONORIFIC_SHORT =
  "(?:군|양)(?=$|[^가-힣]|이|은|는|을|를|에게|한테|과|와|의|도|이랑|하고|께|으로|에|이에요|입니다)";
// 바로 뒤에 이름이 오기 쉬운 관계·역할어
const RELATIONS =
  "친구|남편|아내|와이프|동생|형|누나|언니|오빠|사장|집주인|임대인|임차인|세입자|상대방|판매자|구매자|" +
  "상사|동료|남자친구|여자친구|전남친|전여친|채무자|채권자|가해자|피해자|원고|피고|고소인|피고소인|직원|대표";

// --- 이름이 아닌 활용형 ----------------------------------------------------
// '구해야'·'고소하려면'처럼 성씨 글자로 시작하는 동사·형용사 활용형을 이름으로 보지 않는다.
// 이름(성 뒤 글자)에 거의 쓰이지 않는 형태만 고른다 — '하은'·'하라'·'민서'·'은지' 같은 이름은 남긴다.
// 과거·미래 표지 글자
const VERB_MARK = /[했았었였겠됐셨갔왔봤줬랬켰웠렀졌]/;
// 이름 끝에 오지 않는 연결·종결 어미
const VERB_ENDINGS = [
  "해야", "해서", "해도", "해요", "해줘", "하면", "하고", "하는", "하려", "하러", "하자", "하지",
  "한다", "한대", "할게", "할까", "합니", "됩니", "줘서", "줘야", "와서", "가서", "봐서", "돼서",
  "라고", "래요", "대요", "는데", "지만", "니까", "려고", "려면", "는지", "으면", "으니", "잖아",
  "거든", "더니", "도록",
]; // prettier-ignore
// 성 + 한 글자 동사 어간 ('구해', '구하' + 는)
const VERB_STEM_ONE = "하해했할합";
// '이혼' + 하다, '주장' + 하는처럼 낱말 + 하다
const VERB_AFTER_NOUN = "하해했되돼";

function looksLikeVerb(s: string): boolean {
  const given = s.slice(1);
  if (VERB_MARK.test(given)) return true;
  if (given.length === 1) return VERB_STEM_ONE.includes(given);
  if (VERB_ENDINGS.some((e) => given.endsWith(e))) return true;
  // 앞 두 글자가 일반 낱말이면: 4글자는 복합어('임금체불'), 3글자는 낱말 + 하다('주장하')만 거른다.
  // 3글자 이름('이상윤'·'한도윤'·'이하은')은 앞 두 글자가 낱말이어도 남긴다.
  if (NOT_NAMES.has(s.slice(0, 2))) {
    if (s.length === 4 || VERB_AFTER_NOUN.includes(s[2])) return true;
  }
  return false;
}

// --- 가족·관계 낱말 ------------------------------------------------------
// 성씨 글자로 시작하는 가족·관계 낱말('전처'·'장모'·'이모'·'조카'·'남자친구')은 이름이 아니다.
// '전'·'님'·'분'을 붙인 꼴('전부인'·'전남편'·'장모님'·'남편분')도 같다. '전지현'·'전수민' 같은 이름은
// 목록 낱말이 아니라 그대로 이름 후보다.
const KINSHIP = new Set(
  (
    "처 남편 아내 부인 와이프 배우자 여자친구 남자친구 여친 남친 애인 약혼자 " +
    "장모 장인 장인어른 처형 처제 처남 시어머니 시아버지 시부모 시누이 시동생 며느리 사위 " +
    "이모 이모부 고모 고모부 조카 손자 손녀 손주 남동생 여동생 남매 형부 제부 매형 매제 " +
    "주인 집주인 세입자 임차인 임대인 사장 직원 대표 상사 동료 임원 사업주 고용주 동업자"
  ).split(" "),
);
function isKinship(s: string): boolean {
  let w = s.replace(/(?:님|분)$/, "");
  if (KINSHIP.has(w)) return true;
  // '전처'·'전남편'·'전 여자친구'를 붙여 쓴 '전여자친구'
  if (w.startsWith("전") && w.length >= 2) w = w.slice(1);
  return KINSHIP.has(w);
}
const isPlainWord = (s: string) => NOT_NAMES.has(s) || isKinship(s);

const isNameShape = (s: string) =>
  s.length >= 2 && s.length <= 4 && SURNAMES.includes(s[0]) && !isPlainWord(s);
// 호칭 앞('김미려 씨')은 이름이 거의 확실해 활용형 검사를 하지 않는다. 관계어·"이름은" 뒤에만 쓴다.
const isNameCandidate = (s: string) => isNameShape(s) && !looksLikeVerb(s);

// 관계어 뒤에 띄어 쓴 조사만 온 경우: "사장 한테서", "친구 하고", "남편 이랑은"
// 겹친 조사는 아래 조합만 본다 — '이가은'(이 + 가은)처럼 조사로 시작하는 이름을 놓치지 않게.
const PARTICLE_HEADS = ["한테", "하고", "이랑", "에게", "께서", "이한테", "이에게"];
const isParticle = (s: string) =>
  NAME_TAILS.includes(s) ||
  PARTICLE_HEADS.some(
    (t) => s.startsWith(t) && ["도", "는", "은", "서"].includes(s.slice(t.length)),
  );

/** '김지은은' 같은 낱말에서 조사·호칭을 떼고 이름으로 보이는 부분을 고른다. */
function nameStem(token: string): string | null {
  if (isPlainWord(token) || isParticle(token)) return null;
  for (const tail of NAME_TAILS) {
    if (token.endsWith(tail) && token.length > tail.length) {
      const stem = token.slice(0, -tail.length);
      if (isPlainWord(stem)) return null;
      // 긴 꼬리를 뗀 앞부분이 활용형이면 낱말 전체가 활용형이다: '구하라고' = '구하' + '라고'
      if (isNameShape(stem) && looksLikeVerb(stem)) return null;
      if (isNameCandidate(stem)) return stem;
    }
  }
  return isNameCandidate(token) ? token : null;
}

function findNames(text: string): Set<string> {
  const names = new Set<string>();
  // 1) 이름 + 호칭: "김철수 씨", "이영희님", "박지수 양이"
  const honorific = new RegExp(`([가-힣]{2,4})\\s?(?:${HONORIFIC}|${HONORIFIC_SHORT})`, "g");
  for (const m of text.matchAll(honorific)) {
    if (isNameShape(m[1])) names.add(m[1]);
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
