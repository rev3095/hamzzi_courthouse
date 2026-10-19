// F-007 AC2 민감정보(개인정보보호법 제23조) 가능성 탐지. PRD 범위: 건강·범죄경력.
// 결과는 범주 이름만 돌려준다 — 일치한 단어·문장은 반환·기록하지 않는다.
// 재현율 우선: 범주가 하나라도 걸리면 저장 전에 별도 동의를 받는다 (DATA_MODEL [PII-S]).

export type SensitiveCategory = "health" | "criminal_record";

const KEYWORDS: Record<SensitiveCategory, RegExp> = {
  health:
    /병원|진단|질병|질환|우울증|공황|정신과|정신건강|치료|입원|통원|수술|장애|임신|유산|난임|투병|암\s?(?:진단|수술|환자)|복용|처방|후유증|상해진단서|진단서/,
  criminal_record:
    /전과|범죄\s?경력|수사\s?경력|집행유예|선고유예|기소유예|징역|실형|금고형|벌금형|복역|수감|출소|가석방|보호관찰|전자발찌|처벌\s?받은\s?적/,
};

export function detectSensitive(text: string): SensitiveCategory[] {
  return (Object.keys(KEYWORDS) as SensitiveCategory[]).filter((c) => KEYWORDS[c].test(text));
}
