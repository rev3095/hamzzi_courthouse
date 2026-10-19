import { maskPii, type PiiFinding } from "./detect";
import { detectSensitive, type SensitiveCategory } from "./sensitive";

export type { PiiFinding, PiiType } from "./detect";
export type { SensitiveCategory } from "./sensitive";

export type InputScan = {
  maskedText: string;
  findings: PiiFinding[];
  sensitive: SensitiveCategory[];
};

/**
 * 사용자 입력 1건 처리 (F-007). 호출한 쪽은 반환값만 쓰고 원문 변수는 더 쓰지 않는다.
 * 민감정보 판단은 원문 기준으로 한다(마스킹이 단어를 지울 수 있어서).
 */
export function scanInput(raw: string): InputScan {
  const { maskedText, findings } = maskPii(raw);
  return { maskedText, findings, sensitive: detectSensitive(raw) };
}
