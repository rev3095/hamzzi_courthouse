// 질문 남용 판별 (DEC-072, 2026-11-27 사용자 결정 — 절대 규칙 9). 순수 규칙이라 모델을 부르지 않는다(비용 0).
// 막는 것: ① 법률과 상관없는 요청(음식 추천, 코드·게임·앱 만들기, 그림·이미지 만들기, 글짓기·번역, 잡담, 지시문 바꾸기)을
// 유료 모델로 흘려 보내는 것 ② 같은 글을 복사해 붙이거나 도배해 토큰을 부풀리는 것.
// 이 규칙은 "분명한 경우"만 거른다 — 법률 낱말이 하나라도 있으면 법률 무관으로 막지 않고, 애매한 질문은 질문 해석(Haiku)의
// kind "off_topic"이 답변 모델 전에 막는다(lib/ai/lite.ts·deep.ts). 입력 원문은 이 함수 밖으로 내보내지 않는다(이유 코드만).

export type AbuseReason =
  /** 같은 문장·구절이 되풀이돼 글이 부풀려졌다 */
  | "repetition"
  /** 법률과 상관없는 요청이 분명하다 */
  | "off_topic"
  /** 지시문을 바꾸거나 드러내려는 글 */
  | "instruction";

export type AbuseVerdict = { ok: true } | { ok: false; reason: AbuseReason };

/** 판별 기준 숫자 (바꾸면 abuse.test.ts와 PRD DEC-072을 같이 본다) */
export const ABUSE_LIMITS = {
  /** 문장 단위 반복: 이 길이(공백·문장부호 뺀 글자) 이상인 문장만 센다 */
  sentenceMinChars: 12,
  /** 되풀이된 문장 글자가 이만큼 넘고 */
  repeatedMinChars: 100,
  /** 전체의 이 비율 이상이면 반복 */
  repeatedShare: 0.3,
  /** 구절 단위 반복(문장 구분 없이 붙여 넣은 글): 이 길이 이상 글만 본다 */
  shingleMinChars: 200,
  /** 비교 조각 길이 */
  shingle: 12,
  /** 서로 다른 조각 비율이 이보다 낮으면 반복 (보통 글은 0.9를 넘는다. 두 번 붙이면 0.5 안팎) */
  shingleUniqueMin: 0.6,
  /** 짧은 단위(1~8글자)가 연달아 이만큼 되풀이되면 반복 */
  runRepeats: 30,
  /** 기호 하나(| - = 등)가 공백을 빼고 이만큼 이어지면 반복 (표의 빈 칸 줄은 이보다 짧다) */
  symbolRun: 300,
} as const;

const compactOf = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s.,!?~·…'"“”‘’()[\]{}<>\-_=+*/\\|:;@#$%^&`]+/g, "");

/** 같은 글을 되풀이해 부풀렸는지 */
export function isRepetitive(text: string): boolean {
  const t = text.normalize("NFKC");
  // ⓐ 짧은 단위 연속 반복 (ㅋㅋㅋ…, abcabc…, 같은 낱말 줄줄이). 표를 붙여 넣은 글의 빈 칸(| | |)처럼 기호만
  //    되풀이되는 것은 글자 반복으로 보지 않고(기호를 뺀 글로 본다), 기호 하나가 아주 길게 이어질 때만 막는다
  const runs = new RegExp(`([\\s\\S]{1,8}?)\\1{${ABUSE_LIMITS.runRepeats - 1},}`, "u");
  if (runs.test(compactOf(t))) return true;
  const symbolRun = new RegExp(`(\\S)\\1{${ABUSE_LIMITS.symbolRun - 1},}`, "u");
  if (symbolRun.test(t.replace(/\s+/g, ""))) return true;

  // ⓑ 문장 단위 반복: 앞에 이미 나온 문장과 같은 문장의 글자 수
  const sentences = t
    .split(/(?<=[.!?。？！])\s+|\n+/u)
    .map(compactOf)
    .filter((s) => s.length >= ABUSE_LIMITS.sentenceMinChars);
  const seen = new Set<string>();
  let repeated = 0;
  let total = 0;
  for (const s of sentences) {
    total += s.length;
    if (seen.has(s)) repeated += s.length;
    else seen.add(s);
  }
  if (
    repeated >= ABUSE_LIMITS.repeatedMinChars &&
    total > 0 &&
    repeated / total >= ABUSE_LIMITS.repeatedShare
  )
    return true;

  // ⓒ 구절 단위 반복: 문장 구분 없이 같은 글을 이어 붙였을 때 — 서로 다른 조각의 비율
  const c = compactOf(t);
  if (c.length >= ABUSE_LIMITS.shingleMinChars) {
    const n = ABUSE_LIMITS.shingle;
    const grams = new Set<string>();
    const count = c.length - n + 1;
    for (let i = 0; i < count; i++) grams.add(c.slice(i, i + n));
    if (grams.size / count < ABUSE_LIMITS.shingleUniqueMin) return true;
  }
  return false;
}
/** 법률 질문으로 볼 낱말. 하나라도 있으면 규칙으로는 법률 무관이라 하지 않는다 (애매하면 통과 → 질문 해석이 판단) */
const LEGAL_SIGNAL =
  /법|소송|고소|고발|신고|계약|위약|임대|임차|보증금|전세|월세|집주인|세입자|해고|임금|월급|급여|퇴직|체불|근로|알바|사기|폭행|협박|명예훼손|모욕|저작권|상표|특허|초상권|도용|무단|표절|침해|손해|배상|보상|합의|처벌|벌금|과태료|경찰|검찰|변호사|재판|이혼|양육|위자료|상속|유언|채무|채권|빚|대출|압류|판례|조문|권리|의무|피해|불법|위법|책임|내용증명|소장|약관|환불|개인정보|보험|세금|등기|분쟁|민원|행정|허가|면허|징계|학교폭력|스토킹|성희롱|괴롭힘|교통사고|음주|담보|파산|회생|공탁|증거|증인|진술|피고|원고|고용|노동|산재|위반|대금|용역|외주|유포|합성|딥페이크|잠적|연락\s*두절|투자|리딩방|취소|채용|입사|합격|식중독|이물질|근저당|퍼가|퍼뜨|돈을?\s*(안|못)|(안|못)\s*받|맡겼|도와/u;

/**
 * 분명히 법률과 상관없는 요청 꼴. 요청 낱말과 함께, 글 끝이 부탁·명령 꼴이어야 한다(REQUEST_END) — "~했는데", "~해서 퍼뜨렸어요"처럼
 * 일어난 일을 적은 피해 사연은 걸리지 않게 한다
 */
const OFF_TOPIC_REQUESTS: RegExp[] = [
  // 음식·메뉴
  /(뭐|무엇|무얼|뭘)\s*(을|를)?\s*먹/u,
  /(메뉴|맛집|레시피|요리법|요리|음식|점심|저녁|아침|야식|간식)\s*(좀)?\s*(추천|알려|골라|정해)/u,
  // 코드·게임·앱·사이트 만들기
  /(코드|코딩|프로그램|프로그래밍|스크립트|앱|어플|웹\s*사이트|웹사이트|홈페이지|사이트|게임|봇|챗봇|함수|알고리즘|api|서버|데이터베이스|엑셀\s*매크로|매크로|크롤러)\s*(을|를|좀|하나)?\s*(짜|만들|개발|작성|구현|코딩|제작|빌드)/iu,
  /(python|파이썬|javascript|자바스크립트|typescript|html|css|sql|react|리액트|java|자바|c\+\+|unity|유니티|kotlin|swift)\s*(로|으로)?\s*[\s\S]{0,20}(짜|만들|개발|작성|구현|코딩)/iu,
  // 그림·이미지·영상 만들기
  /(이미지|그림|사진|일러스트|로고|짤|캐릭터|배경화면|썸네일|아이콘|영상|동영상|웹툰)\s*(을|를|좀|하나|로)?\s*[\s\S]{0,10}(그려|그리|만들|뽑아|생성|합성|편집)/u,
  /스타일\s*(의|로)?\s*(이미지|그림|사진)/u,
  // 글짓기·번역·숙제
  /(시|소설|노래|가사|랩|시나리오|대본|자기소개서|자소서|광고\s*문구|카피|블로그\s*글|편지|축사|연설문|레포트|리포트|과제|숙제|독후감|에세이)\s*(을|를|좀|하나)?\s*(써|쓰|지어|작성|만들)/u,
  /번역\s*(해|좀|부탁)|영어로\s*(바꿔|번역)/u,
  /(수학|방정식|미적분|물리|화학)\s*(문제|풀이|숙제)/u,
  // 추천·예측 잡담
  /(날씨|주식|코인|비트코인|로또|운세|타로|사주|궁합|영화|드라마|노래|여행지|선물)\s*(좀)?\s*(추천|알려|예측|어때|봐\s*줘)/u,
];

/** 부탁·명령으로 끝나는 글 (요청 꼴 판별에 함께 쓴다) */
const REQUEST_END =
  /(줘|줘요|주세요|줄래|줄래요|줄\s*수\s*있어\??|줄\s*수\s*있나요|해봐|해\s*봐|하자|할까|할까요|먹지|먹을까|먹을까요|추천|부탁(해|해요|드려요|합니다)?)[\s!?.~ㅋㅎ^]*$/u;
/** 규칙으로 요청 꼴을 막는 글 길이 상한 — 더 긴 글은 질문 해석(모델)이 판단한다 */
export const OFF_TOPIC_MAX_CHARS = 80;

/** 인사·잡담만 있는 글 */
const CHITCHAT_ONLY =
  /^(안녕|안녕하세요|하이|헬로|hello|hi|ㅎㅇ|심심해|놀아\s*줘|뭐해|ㅋ+|ㅎ+|테스트|test)[\s!?.~ㅋㅎ^]*$/iu;

/**
 * 지시문을 바꾸거나 드러내려는 글 (법률 낱말과 상관없이 막는다). "설정"처럼 법률에서도 쓰는 낱말(근저당 설정)은 넣지 않고,
 * "너는 이제부터 내 변호사야" 같은 역할 지정 머리말도 넣지 않는다(다른 챗봇에 익숙한 사용자가 흔히 쓴다 — 법률 무관이면 모델 판별이 막는다)
 */
const INSTRUCTION_ATTACK =
  /시스템\s*프롬프트|system\s*prompt|(지시문|프롬프트)\s*(을|를)?\s*(무시|잊|알려|보여|출력|공개)|(위의?|앞의?|이전|기존|모든)\s*(지시|명령)\s*(을|를)?\s*(무시|잊)(하고|해|어)|ignore\s+(all\s+|the\s+|any\s+)?(previous|prior|above)\s+(instructions|prompts|rules)|developer\s*mode|jailbreak/iu;

/** 코드 붙여 넣기 꼴: 기호 비율이 높고 한글이 거의 없다 */
function looksLikeCode(t: string): boolean {
  if (t.length < 120) return false;
  const symbols = (t.match(/[{}();<>=[\]]/g) ?? []).length;
  const hangul = (t.match(/[가-힣]/g) ?? []).length;
  return symbols / t.length > 0.06 && hangul / t.length < 0.15;
}

/** 가림 표시([전화번호]·[계좌번호]·[이름1] 등)는 반복 판별에서 뺀다 — 가린 번호 목록·같은 문자 여러 통이 반복으로 잡히지 않게 */
const MASK_TOKEN = /\[[^\]\s]{1,10}\]/gu;

/**
 * 질문을 유료 모델에 보내기 전에 거른다. ok가 아니면 저장·모델 호출 없이 거절한다.
 * 가린 문장(maskedText)을 넘긴다 — 질문 저장 전(POST /inquiries)과 분석 직전(analyze)이 같은 기준을 쓰도록.
 * 첨부 자료(판독 정리)는 서버가 만든 글이라 반복 판별에 넣지 않는다.
 */
export function screenQuestion(text: string): AbuseVerdict {
  const t = text.normalize("NFKC").trim();
  if (INSTRUCTION_ATTACK.test(t)) return { ok: false, reason: "instruction" };
  if (isRepetitive(t.replace(MASK_TOKEN, " "))) return { ok: false, reason: "repetition" };
  if (!LEGAL_SIGNAL.test(t)) {
    // 한글 자모(ㅋ·ㅎ)는 NFKC를 거치면 다른 글자가 되므로 원문으로 본다
    if (CHITCHAT_ONLY.test(text.trim())) return { ok: false, reason: "off_topic" };
    if (
      t.length <= OFF_TOPIC_MAX_CHARS &&
      REQUEST_END.test(t) &&
      OFF_TOPIC_REQUESTS.some((r) => r.test(t))
    )
      return { ok: false, reason: "off_topic" };
    if (looksLikeCode(t)) return { ok: false, reason: "off_topic" };
  }
  return { ok: true };
}

/**
 * 거절을 경고로 셀지. 규칙 판별의 법률 무관·반복 거절은 비용이 들지 않고 고쳐 쓰는 사람이 막히지 않게 세지 않는다.
 * 지시문 바꾸기와 모델 판별(질문 해석 비용이 든다)만 센다
 */
export function countsAsStrike(reason: AbuseReason | "model"): boolean {
  return reason === "instruction" || reason === "model";
}
