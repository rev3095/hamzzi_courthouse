// 판례·조문 직접 검색 화면 공통 조각. AI가 만든 내용이 없으므로 AI_NOTICE 대신 SEARCH_NOTICE를 쓴다 (절대 규칙 6 취지).
import type { ClientError } from "@/lib/client/api";
import { SEARCH_NOTICE } from "@/lib/api/respond";

export function SearchNotice({ notice = SEARCH_NOTICE }: { notice?: string }) {
  return (
    <p className="bg-soft text-muted w-fit rounded-[6px] px-2.5 py-1 text-xs font-semibold">
      {notice}
    </p>
  );
}

export function SearchCredit() {
  return (
    <section
      aria-label="출처"
      className="border-line text-muted mt-8 border-t pt-4 text-[13px] leading-relaxed"
    >
      <p>
        출처: 법제처 국가법령정보센터 · &lsquo;원문 보기&rsquo;에서 국가법령정보센터 원문을 확인할
        수 있어요. 판결문 전문은 저장하지 않아요.
      </p>
      <p className="mt-1">
        ⚖ 법률 정보 제공용이며 법률 자문이 아니에요. 중요한 결정 전에는 변호사·법무사와 상담하세요.
      </p>
    </section>
  );
}

export function OriginalLink({
  url,
  label = "법제처 원문 보기 →",
}: {
  url: string;
  label?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-link inline-flex min-h-11 items-center text-sm underline-offset-2 hover:underline"
    >
      {label}
    </a>
  );
}

/** 검색 화면 오류 문장. 서버 고정 문구·코드만 쓴다 */
export function searchErrorText(err: ClientError): string {
  if (err.code === "EMPTY_INPUT") return "검색어를 적어 주세요.";
  if (err.code === "VALIDATION_ERROR" && err.details?.reason === "personal_info")
    return "이름·전화번호 같은 개인정보로 보이는 검색어는 법제처로 보내지 않아요. 빼고 다시 검색해 주세요.";
  if (err.code === "VALIDATION_ERROR") return "검색어는 100자까지 적을 수 있어요.";
  if (err.code === "RATE_LIMITED")
    return "이 네트워크에서 검색을 많이 했어요. 1시간 안에 할 수 있는 횟수가 정해져 있어요. 잠시 뒤에 다시 해 주세요.";
  if (err.code === "SEARCH_UPSTREAM_FAILED")
    return "법제처에서 결과를 불러오지 못했어요. 결과가 없는 게 아니라 연결 문제예요. 잠시 후 다시 시도해 주세요.";
  if (err.code === "NOT_FOUND") return "법제처에서 찾을 수 없어요. 주소가 맞는지 확인해 주세요.";
  return `일시적인 오류가 발생했어요.${err.requestId ? ` (오류 번호 ${err.requestId})` : ""}`;
}
