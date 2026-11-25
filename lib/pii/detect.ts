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
    "지난 지난달 이번달 다음달 작년 올해 이미 아직 우리 저희 그쪽 이쪽 하루 일단 유리 불리 피해 피해자 가해자 " +
    // 관계어 뒤에 자주 오는 사건 낱말 (예: "직원 정규직", "남편 이혼", "사장 임금체불")
    "이혼 정규직 비정규직 전입 전출 고용 고용주 이직 구직 구인 지원금 신용 조정 하청 차용 " +
    "차용증 양육 양육비 양육권 임금체불 진단 진단서 진정 진정서 장난 손님 남자 이제 주로 정작 하지만 이렇게 주말 " +
    // 성씨 글자로 시작하는 일반 낱말·대명사 (예: "친구 오해를", "이번주 양육비", "나는 사장님한테")
    "이해 오해 장해 유해 한해 이번주 지난주 다음주 전부터 전에 나는 나도 나를 나한테 나랑 나와 나의 나에게"
  ).split(" "),
);
// 이름 뒤에 붙는 말(호칭·조사). 긴 것부터 떼어 본다.
const NAME_TAILS = [
  "에게서", "한테서", "에게", "한테", "께서", "이랑", "하고", "으로", "에서", "과의", "와의",
  "이가", "이는", "이를", "이한테", "이에게", "은", "는", "이", "가", "의", "에", "도", "를", "을",
  "과", "와", "랑", "로", "씨", "님", "이에요", "예요", "입니다", "이고", "이며",
  "이라고", "라고", "이라는", "라는",
  // 한 글자 어미도 떼어 본다: "이름은 김민수고", "가해자 김민수요", "친구 이상온아"
  "고", "요", "면", "야", "며", "아", "이요", "이야", "이면",
].sort((a, b) => b.length - a.length); // prettier-ignore
const HONORIFIC = "씨|님|선생님|사장님|대표님|과장님|부장님|팀장님|대리님|실장님|기사님";
// 한 글자 호칭 '군'·'양'은 그 글자로 시작하는 낱말("전처가 양육비", "김철수 군대")을 호칭으로 보지 않는다.
// 재현율 우선이라 뒤에 오는 말을 허용 목록으로 좁히지 않는다("박서율 양만", "김철수 군까지"도 가린다).
// '양도'는 "양도 왔어요"(조사 도)와 겹쳐 뒤에 글자가 더 붙은 꼴('양도세')만 낱말로 본다.
const YANG_WORDS =
  "육|도[가-힣]|보|식|말|파|심|해|측|쪽|국|친|부(?!터)|모|변|형|수|호|성|주|념|산|력|극|질|자|계|궁|복|반|상|약|" +
  "가|다리|아|딸|녀|천|평|재|치";
const GUN_WORDS =
  "대|인|복|사|청|수|만두|데|것|입대|필|미필|의관|생활|단|부(?!터)|내|민|무원|면제|형법|법|검찰|산|포|중";
const HONORIFIC_SHORT = `(?:양(?!${YANG_WORDS})|군(?!${GUN_WORDS}))`;
// 그런 낱말 앞이라도 앞말이 3글자 이상 이름이면 가린다("김철수 군대 갔어요", "김하은 양육비")
const SHORT_WORD_AFTER = `(?:양(?=${YANG_WORDS})|군(?=${GUN_WORDS}))`;
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

const ADVERB_PREFIX = new Set(["이제", "주로", "정작"]);

function looksLikeVerb(s: string): boolean {
  const given = s.slice(1);
  if (VERB_MARK.test(given)) return true;
  if (given.length === 1) return VERB_STEM_ONE.includes(given);
  if (VERB_ENDINGS.some((e) => given.endsWith(e))) return true;
  // '지속적'·'고정적인'처럼 '-적'으로 끝나는 말 (이름 끝에 '적'은 거의 오지 않는다)
  if (/적인?$/.test(given)) return true;
  // 앞 두 글자가 일반 낱말이면: 4글자는 복합어('임금체불'), 3글자는 낱말 + 하다('주장하')만 거른다.
  // 3글자 이름('이상온'·'한도윤'·'이하은')은 앞 두 글자가 낱말이어도 남긴다.
  // 부사('이제'·'주로'·'정작')는 이름 앞부분과 겹쳐('이제해') 이 검사에서 뺀다.
  if (NOT_NAMES.has(s.slice(0, 2)) && !ADVERB_PREFIX.has(s.slice(0, 2))) {
    if (s.length === 4 || VERB_AFTER_NOUN.includes(s[2])) return true;
  }
  return false;
}

// --- 가족·관계 낱말 ------------------------------------------------------
// 성씨 글자로 시작하는 가족·관계 낱말('전처'·'장모'·'이모'·'조카'·'남자친구')은 이름이 아니다.
// '님'·'분'을 붙인 꼴('장모님'·'남편분')과 '전(前)'을 붙여 쓴 꼴('전부인'·'전여자친구')도 같다.
// '전다솜'·'전수민' 같은 이름은 목록 낱말이 아니라 그대로 이름 후보다.
const KINSHIP = new Set(
  (
    "처 남편 아내 부인 와이프 배우자 여자친구 남자친구 여친 남친 애인 약혼자 " +
    "장모 장인 장인어른 처형 처제 처남 시어머니 시아버지 시부모 시누이 시동생 며느리 사위 " +
    "오빠 이모 이모부 고모 고모부 조카 손자 손녀 손주 남동생 여동생 남매 형부 제부 매형 매제 지인 " +
    "주인 집주인 세입자 임차인 임대인 사장 직원 대표 상사 동료 임원 사업주 고용주 동업자"
  ).split(" "),
);
// '전'을 붙여 쓰는 낱말만 — '전이모'·'전손주'·'전장인'·'전지인' 같은 꼴은 이름일 수 있어 남긴다
const EX_KINSHIP = new Set(
  (
    "처 남편 아내 부인 와이프 배우자 여자친구 남자친구 여친 남친 애인 약혼자 " +
    "시어머니 시아버지 시부모 시누이 며느리 사위 장모 장인어른 처형 처제 처남 " +
    "사장 직원 대표 주인 집주인 세입자 임차인 임대인 고용주 사업주 동업자 동료 상사"
  ).split(" "),
);
function isKinship(s: string): boolean {
  const w = s.replace(/(?:님|분)$/, "");
  if (KINSHIP.has(w)) return true;
  return w.length >= 2 && w.startsWith("전") && EX_KINSHIP.has(w.slice(1));
}

// 꼬리가 앞 낱말의 받침과 맞을 때만 조사로 본다. '이모은'은 '이모' + '은'이 아니라(받침 없는 말
// 뒤에는 '는') 이름이다. 부르는 말 '아'·'야'는 가족 낱말에 거의 붙지 않아 가리는 쪽을 택한다.
const hasBatchim = (s: string) => {
  const c = s.charCodeAt(s.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0;
};
const AFTER_BATCHIM = ["은", "을", "과", "과의", "으로"];
const AFTER_VOWEL = ["는", "가", "를", "와", "와의", "랑", "라고", "라는", "예요"];
function particleFits(stem: string, tail: string, vocativeIsName = true): boolean {
  const batchim = hasBatchim(stem);
  // 부르는 말: '아'(받침 뒤)는 일반 낱말에도 거의 붙지 않아 이름으로 본다('친구 신분아', '친구 주인아').
  // '야'는 가족 낱말 뒤면 이름으로 보고, 일반 낱말 뒤면 받침 없는 낱말의 끝말로 본다('진짜야').
  if (tail === "아") return false;
  if (tail === "야") return vocativeIsName ? false : !batchim;
  if (AFTER_BATCHIM.includes(tail) || tail.startsWith("이")) return batchim;
  if (AFTER_VOWEL.includes(tail)) return !batchim;
  // '로'는 받침이 없거나 ㄹ 받침 뒤
  if (tail === "로") return !batchim || (stem.charCodeAt(stem.length - 1) - 0xac00) % 28 === 8;
  return true;
}

const isNameShape = (s: string) =>
  s.length >= 2 && s.length <= 4 && SURNAMES.includes(s[0]) && !NOT_NAMES.has(s);
// 호칭 앞('김채려 씨')은 이름이 거의 확실해 활용형 검사를 하지 않는다. 관계어·"이름은" 뒤에만 쓴다.
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
  if (NOT_NAMES.has(token) || isKinship(token) || isParticle(token)) return null;
  for (const tail of NAME_TAILS) {
    if (token.endsWith(tail) && token.length > tail.length) {
      const stem = token.slice(0, -tail.length);
      // '이'로 끝나는 낱말 + 조사('전시누이' + '가')를 이름 + '이가'로 읽지 않는다
      if (tail.length > 1 && tail.startsWith("이")) {
        const word = stem + "이";
        const rest = tail.slice(1);
        if (NOT_NAMES.has(word) && particleFits(word, rest, false)) return null;
        if (isKinship(word) && particleFits(word, rest)) return null;
      }
      // 일반 낱말 + 맞는 조사면 이름이 아니다. 받침이 안 맞으면('이하' + '은' → '이하은') 계속 본다.
      if (NOT_NAMES.has(stem)) {
        if (particleFits(stem, tail, false)) return null;
        continue;
      }
      // 가족 낱말 + 맞는 조사('전처가'·'장모님이')면 이름이 아니다. 받침이 안 맞으면('이모은') 계속 본다.
      if (isKinship(stem)) {
        if (particleFits(stem, tail)) return null;
        continue;
      }
      // 긴 꼬리를 뗀 앞부분이 활용형이면 낱말 전체가 활용형이다: '구하라고' = '구하' + '라고'
      // 한 글자 꼬리는 이름 끝 글자일 수 있어('김하은' ≠ '김하' + '은') 두 글자 이상만 본다.
      if (tail.length >= 2 && isNameShape(stem) && looksLikeVerb(stem)) return null;
      if (isNameCandidate(stem)) return stem;
    }
  }
  return isNameCandidate(token) ? token : null;
}

// 호칭 바로 앞에는 조사가 오지 않는다: '남편이 양다리', '이번에 선생님이'의 앞말은 낱말 + 조사다.
// 받침이 맞을 때만 나눈다 — '이하은 씨'는 '이하' + '은'이 아니라 이름이다.
// 가족 낱말은 늘 나눈다('남편이 군 복무', '남친이 사장님한테'). 일반 낱말은 호칭과 상관없이 이름 끝 글자가
// 되기 쉬운 꼬리(은·이·아·야·랑·도·로)로 나누지 않는다 — '이상은 사장님', '이웃도 씨', '이사야 씨'는 이름이다.
// 다만 이름 앞부분이 되기 어려운 때·부사·기관 낱말은 늘 나눈다('지금은 사장님이', '오늘도 사장님이').
const NAME_END_TAILS = ["은", "이", "아", "야", "랑", "도", "로"];
const ALWAYS_SPLIT = new Set(
  (
    "오늘 어제 내일 지금 이제 이번 이전 이후 나중 지난 지난달 이번달 다음달 이번주 지난주 다음주 " +
    "작년 올해 하루 한달 한번 아직 일단 정말 진짜 주로 정작 전부 전원 전체 우리 저희 " +
    "정부 고객 손님 회원 회사 법인 학교 병원 은행 보험사 경찰 검찰 법원 구청 공단 한국 남자 주말 " +
    // 직위 낱말('차장이 사장님한테'). '강사'·'이사'는 '강사랑'·'이사랑' 같은 이름과 겹쳐 넣지 않는다.
    "차장 주임 조장 전무 고문 이사장 지점장 구청장 장관"
  ).split(" "),
);
function isWordWithParticle(s: string): boolean {
  return NAME_TAILS.some((tail) => {
    if (!s.endsWith(tail) || s.length <= tail.length) return false;
    const stem = s.slice(0, -tail.length);
    if (isKinship(stem) && particleFits(stem, tail)) return true;
    if (!NOT_NAMES.has(stem)) return false;
    if (NAME_END_TAILS.includes(tail) && !ALWAYS_SPLIT.has(stem)) return false;
    return particleFits(stem, tail, false);
  });
}

function findNames(text: string): Set<string> {
  const names = new Set<string>();
  // 1) 이름 + 호칭: "김철수 씨", "이영희님", "박서율 양이"
  const honorific = new RegExp(`([가-힣]{2,4})\\s?(?:${HONORIFIC}|${HONORIFIC_SHORT})`, "g");
  for (const m of text.matchAll(honorific)) {
    // '장모님'·'이모님'처럼 '님'류 호칭 앞의 가족 낱말만 뺀다. '장인 씨' 같은 외자 이름은 가린다.
    if (!isNameShape(m[1]) || isWordWithParticle(m[1])) continue;
    if (!(m[0].endsWith("님") && isKinship(m[1]))) names.add(m[1]);
  }
  // 1-1) '군'·'양'으로 시작하는 낱말 앞: 앞말에서 조사를 떼어 3글자 이상 이름일 때만 ("김철수 군대")
  const beforeWord = new RegExp(`(?<![가-힣])([가-힣]{3,7})\\s?${SHORT_WORD_AFTER}`, "g");
  for (const m of text.matchAll(beforeWord)) {
    const stem = nameStem(m[1]);
    if (stem && stem.length >= 3) names.add(stem);
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

/**
 * 번호·이메일·주소 꼴만 가린다 (이름은 그대로 둔다). 사건 진행(F-016, DEC-053)처럼 본인 사건 자료의 이름을
 * 보여야 하는 곳에서, 연락처·등록번호가 화면·저장소에 남지 않게 할 때 쓴다. 가리기 규칙은 maskPii의 숫자 패턴과 같다.
 */
export function maskContacts(text: string): string {
  let masked = text;
  for (const [type, re] of NUMERIC) {
    masked = masked.replace(re, (m) =>
      type === "account" && !/^\d+$/.test(m) && (digitCount(m) < 10 || digitCount(m) > 16)
        ? m
        : TOKEN[type],
    );
  }
  return masked;
}

/**
 * 관계·역할어 바로 뒤에 온 낱말에서 조사·호칭을 떼고 이름으로 보이는 부분을 돌려준다 (없으면 null).
 * maskPii의 "관계어 + 이름" 규칙과 같은 판단이다 — 서류 판독(F-015)이 서류 역할어(발신인·수신인 등) 뒤에도 쓰려고 내보낸다.
 */
export function nameAfterRelation(token: string): string | null {
  return nameStem(token);
}

// 이미 일부 가린 서면의 "박○○"·"김OO"·"이○영" 꼴: 성 한 글자가 남아 있어 개인을 좁힌다.
// 성씨 목록은 위 SURNAMES에 서류 판독(F-015)이 역할어 뒤에서 더 보는 성을 더했다 ('제○○조'와 겹치는 '제'는 뺀다).
const STUB_SURNAMES = `${SURNAMES}방변설표여추석천함원공현염도소선마길연위명기반왕금옥육인맹탁국어은편용`;
// 서면이 쓰는 가림 기호 (전각 글자 포함). 글 전체를 NFKC로 바꾸면 "㈜" 같은 표기가 달라져 기호를 직접 나열한다.
// 한 자리 가림(박○·홍○동·홍길○)에는 도형 기호만 쓴다 — ASCII O·X·*는 서류의 O/X 표·각주("이행X", "이자*")와 겹친다
const ONE_MASK = "○◯〇●□△◇■◆▲★☆◎ㅇ＊×";
const STUB_MASK = `${ONE_MASK}*XxＸｘOoＯｏ`;
const M = `[${STUB_MASK}]`;
const M1 = `[${ONE_MASK}]`;
const DOUBLE_SURNAMES = "남궁|황보|제갈|선우|독고|사공|서문|동방";
// 끝 자리 가림(홍길○)은 두 글자 낱말 + 표시("이행○")와 겹쳐 호칭·조사가 붙을 때만 본다
const NAME_AFTER = "(?=\\s?(?:씨|님)|에게|한테|께서|은|는|이|가|을|를|과|와|의)";
// 가운데 한 자리 가림 꼴(박○·홍○동)은 일반 낱말과 겹치기 쉬워 이름이 끝나는 자리만 본다
const STUB_TAILS = [
  "에게서", "한테서", "으로부터", "이라고", "이라는", "께서", "에게", "한테", "으로", "라고", "라는", "이며",
  "이고", "이었", "까지", "은", "는", "이", "가", "을", "를", "의", "에", "도", "와", "과", "로", "께", "씨",
  "님", "측",
].join("|"); // prettier-ignore
const NAME_END = `(?=(?:${STUB_TAILS})|[^가-힣A-Za-z0-9${STUB_MASK}]|$)`;
// 서면에 붙여 쓴 역할어 바로 뒤("임대인박○○은")도 이름 자리로 본다
const GLUED_ROLE =
  "임대인|임차인|원고|피고|채권자|채무자|발신인|수신인|신청인|피신청인|고소인|피고소인|대표이사|대표자|" +
  "대표|근로자|매도인|매수인|피해자|가해자|보증인|중개인";
const SURNAME_STUB = new RegExp(
  // 붙여 쓴 역할어 뒤는 '인'으로 시작하지 않을 때만 ("피고인○○"의 '인'은 역할어의 일부)
  `(?:(?<=${GLUED_ROLE})(?!인)|(?<![가-힣A-Za-z0-9${STUB_MASK}]))` +
    `(?:` +
    // 두 글자 성 + 가림 기호: 황보○○ · 선우○ · 제갈○○
    `(?:${DOUBLE_SURNAMES})${M}+(?![A-Za-z])|` +
    `[${STUB_SURNAMES}](?:` +
    // 가림 기호 둘 이상(박○○·김OO·정**·박○O·박○○○○)은 뒤에 무엇이 붙어도 (씨가·과의·측은) 이름 자리로 본다
    `${M}{2,}(?![A-Za-z])|` +
    // 한 자리만 가린 꼴은 일반 표기("유○ 무×", "이자*는")와 겹쳐 좁게 본다:
    // 홍*동 (이름이 끝나는 자리) · 박○·홍길○ (도형 기호, 호칭·조사 앞) · 홍길* (ASCII *는 씨·님 앞만)
    `${M}[가-힣](?!${M})${NAME_END}|` +
    `[가-힣]?${M1}${NAME_AFTER}|` +
    `[가-힣]\\*(?=\\s?(?:씨|님))))`,
  "g",
);

/**
 * 성 한 글자 + 가림 기호 꼴("박○○", "김OO", "홍*동", "홍길*")을 "○○○"로 바꾼다 (F-015 AC2, 절대 규칙 4).
 * 성씨 글자 앞이 한글·가림 기호로 이어지는 자리("서울○○지방법원", "○○물산", "제○○조")는 건드리지 않는다.
 * 띄어 쓴 성씨 글자 뒤의 지명(“강○○로”)도 가려질 수 있다 — 이름을 놓치는 쪽보다 낫게 본다.
 * maskPii에는 넣지 않았다 — 서류 판독처럼 가린 서면을 다시 옮기는 경로가 직접 부른다. count는 바꾼 자리 수.
 */
export function maskSurnameStubs(text: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(SURNAME_STUB, () => {
    count += 1;
    return "○○○";
  });
  return { text: out, count };
}
