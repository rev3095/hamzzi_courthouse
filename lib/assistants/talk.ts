// 분야별 비서의 대화 한마디 (F-018, DEC-057). 순수 규칙 — 지시문·출력 형식·거르기.
// 대화는 Haiku가 맡고(짧은 공감·정리와 더 알려 줄 사실 묻기), 법령·판례 근거 답변은 Pro Max(지금 Opus 5.5 effort high)가 따로 쓴다.
// 대화 한마디에는 근거가 없으므로 법령·조문·판례·사건번호·숫자·결과 판단을 담지 못하게 하고, 담겼으면 그 문장을 버린다.
import { z } from "zod";
import { isAssertive } from "@/lib/ai/policy";
import { articlesIn, caseNumbersIn } from "@/lib/citations/patterns";
import { scanInput } from "@/lib/pii";
import type { Assistant } from "./agents";

export type AssistantTalk = {
  /** 사연을 들었다는 짧은 정리 (한두 문장) */
  reply: string;
  /** 근거를 더 맞게 찾는 데 필요한, 사연에 없는 사실을 묻는 질문 (셋까지) */
  asks: string[];
};

export const TALK_MAX = { reply: 160, ask: 80, asks: 3 } as const;

/** 출력 형식 (구조화 출력) */
export const TALK_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    asks: { type: "array", items: { type: "string" } },
  },
  required: ["reply", "asks"],
  additionalProperties: false,
} as const;

export const TalkZ = z.object({ reply: z.string(), asks: z.array(z.string()) });

/** 대화 지시문. 비서마다 이름·분야만 다르고 규칙은 같다 */
export function talkSystem(a: Pick<Assistant, "name" | "tagline">): string {
  return `당신은 햄찌법원의 분야별 비서 "${a.name}"(AI)입니다. 분야: ${a.tagline}.
사용자의 사연을 듣고 짧게 대화합니다. 법령·판례를 근거로 한 답변은 다른 단계가 따로 쓰므로, 당신은 대화만 합니다.
- reply: 사연을 이해했다는 짧은 정리와 공감을 존댓말로 한두 문장 씁니다. ${TALK_MAX.reply}자 이내.
- asks: 근거를 더 맞게 찾는 데 필요한데 사연에 없는 사실을 묻는 질문을 셋까지 씁니다. 각 ${TALK_MAX.ask}자 이내. 필요 없으면 빈 목록.
- 법령 이름·조문·판례·사건번호·숫자(날짜·금액·기간 포함)를 쓰지 않습니다.
- 승소·처벌·해결 가능성이나 유불리를 말하지 않고, "반드시"·"무조건" 같은 단정 표현을 쓰지 않습니다.
- 사용자가 말하지 않은 사실을 사실처럼 쓰지 않습니다. 이름·연락처·계좌번호를 묻지 않습니다.
- 이전 대화는 맥락으로만 참고합니다.`;
}

/** 판정·법적 결론으로 읽히는 말 (절대 규칙 2) */
// 죄명·해당 여부·성립 같은 근거 없는 법적 결론도 막는다 ("모욕죄로 고소할 수 있어요", "사기에 해당해요")
const JUDGING =
  /승률|승소|패소|이길|이깁|이기실|질\s*거|성공\s*(확률|가능)|가능성|확률|유리|불리|합법|적법|불법(입|이에)|처벌\s*(을|이)?\s*(받|될|됩)|무죄|유죄|구속(될|됩)|법\s*위반(입|이에)|죄(로|가|에|입|이|는|를)|해당(해|합|될|됩|하)|성립|범죄(예|입|이에|로)/;

/**
 * 한글로 쓴 숫자 + 기간·금액 단위 (절대 규칙 3, lib/procedure/labels.ts HANGUL_NUMBER와 같은 생각).
 * "이 일·이번·이 건"처럼 흔한 말과 겹치지 않게, 한자어 수사 한 글자 뒤의 '일'과 번·건·명은 보지 않는다
 */
// 단위 뒤에는 끝·띄어쓰기·조사만 온다("삼 년이", "두 달 안에"). 지시어 "이"(이 시간·이 회)는 한 글자일 때 수사로 보지 않는다
// 달·개월·년·시간·원·퍼센트처럼 다른 낱말과 겹칠 일이 적은 단위는 뒤를 보지 않고("한 달까지", "두 달씩"),
// 해·주·일·회·배처럼 겹치는 단위("한 해결", "세 주장", "이 일")만 끝·띄어쓰기·조사가 올 때 숫자로 본다
const AFTER = "(?=$|[^가-힣]|[이가은는을를의에도만쯤째간동내까부씩여밖로])";
const SINO_ONE = "[일삼사오육칠팔구십백천만억]"; // 한 글자 수사 — 지시어 '이'는 뺀다
const SINO_MANY = "[일이삼사오육칠팔구십백천만억]{2,}";
const NATIVE = "(?:한|두|세|석|네|넉|다섯|여섯|일곱|여덟|아홉|열|스무|서른)";
const HANGUL_NUMBER = new RegExp(
  [
    `(?:^|[^가-힣])(?:${SINO_ONE}|${SINO_MANY})\\s*(?:개월|년|시간|원|퍼센트|프로)`,
    `(?:^|[^가-힣])(?:${SINO_ONE}|${SINO_MANY})\\s*(?:주일|회|차례)${AFTER}`,
    `(?:^|[^가-힣])(?:[삼사오육칠팔구십]|${SINO_MANY})\\s*(?:일|주)${AFTER}`,
    `(?:^|[^가-힣])${NATIVE}\\s*(?:달|시간)`,
    `(?:^|[^가-힣])${NATIVE}\\s*(?:해|주|차례|배)${AFTER}`,
    "일주일|보름|열흘|이틀|사흘|나흘|닷새|엿새|이레|반년|반달|하루\\s*(?:안|만|이내|내)",
  ].join("|"),
);

/** 아라비아·전각 숫자나 한글로 쓴 숫자 + 기간·금액 단위가 있는가 (절대 규칙 3, 아카이브 정리 문장도 같이 쓴다) */
export function hasNumber(text: string): boolean {
  return /[0-9０-９]/.test(text) || HANGUL_NUMBER.test(text);
}

/** 법령 이름·법 언급. "방법·불법·위법·합법·편법·입법·문법·요법·마법"과 '법원·법적'은 빼고 "○○법"을 본다 */
const LAW_MENTION =
  /[가-힣]{2,}(?<![방불위합편입문요마수용])법(?![원적인])|법률|법령|조문|판례|판결|대법원|형법|민법|상법|헌법|시행령/;

/** 한 문장이 대화 한마디로 내보낼 수 있는가 */
export function talkLineOk(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (hasNumber(t)) return false;
  if (isAssertive(t) || JUDGING.test(t)) return false;
  if (articlesIn(t).length > 0 || caseNumbersIn(t).length > 0) return false;
  // 근거 없는 법 언급은 대화 한마디에 넣지 않는다 (근거 답변이 따로 법령·판례를 단다)
  if (LAW_MENTION.test(t)) return false;
  if (scanInput(t).findings.length > 0) return false;
  return true;
}

/**
 * 모델 출력을 거른다. 규칙에 걸린 문장은 버리고, 정리 문장이 걸리면 한마디 전체를 내보내지 않는다(null).
 * 길이는 자르지 않고 넘으면 버린다 — 자른 문장이 뜻을 바꾸지 않게.
 */
export function screenTalk(raw: unknown): AssistantTalk | null {
  const parsed = TalkZ.safeParse(raw);
  if (!parsed.success) return null;
  const reply = parsed.data.reply.trim();
  if (reply.length > TALK_MAX.reply || !talkLineOk(reply)) return null;
  const asks = parsed.data.asks
    .map((s) => s.trim())
    .filter((s) => s.length <= TALK_MAX.ask && talkLineOk(s))
    .slice(0, TALK_MAX.asks);
  return { reply, asks };
}
