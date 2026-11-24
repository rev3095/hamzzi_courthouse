// POST /api/v1/matters/company — 사건 진행: 기업 조사 (F-016 AC4, DEC-053, API.md). 로그인 사용자만.
// 본문 { name, matterId, isBusiness?, urls?, pasted? }. 회사가 무엇을 하고 무엇을 팔며 어떻게 버는지를 공개 웹 자료에서 찾아 정리한다.
// - 법인·사업자만 대상이다. 개인을 조사하는 기능이 아니다: 사람 이름 꼴은 거절, 상호·기관 표지 없는 이름은 사용자 확인(isBusiness)이
//   있어야 보내고, 모델도 사람이면 조사하지 않는다(ai.reason "person"). 결과에는 공개 자료 속 대표자 이름 한 항목만 남을 수 있다(DEC-053).
// - 붙여 넣은 글·검색 요약문에서 가릴 이름은 서버가 저장된 그 사건의 당사자에서 직접 모은다(maskNamesOf).
// - 웹 페이지는 우리 서버가 긁지 않는다. Claude의 웹 검색·웹 가져오기 도구가 가져오고, 자동 접근을 막은 사이트는 "읽지 못함"으로 돌려준다.
// - 공식 API(네이버 지역·블로그 검색, 금융위 기업기본정보)는 키가 있을 때만 함께 쓴다. 블로그는 제목·요약문만 받는다(본문은 가져오지 않는다).
// - 평가·전망은 내지 않는다 (절대 규칙 2). 출처는 도구가 실제로 가져온 주소만 싣는다. 결과는 여기서 저장하지 않는다.
import { researchCompany } from "@/lib/ai/company";
import { COMPANY_WEIGHT } from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE, ok } from "@/lib/api/respond";
import { BUSINESS_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { readJson, withRoute } from "@/lib/api/route";
import { businessLinks } from "@/lib/business/policy";
import { searchBlogs, searchCorps, searchPlaces } from "@/lib/business/source";
import { assertMatterAiRate, runMatterAi } from "@/lib/matters/ai-gate";
import {
  COMPANY_NOTICE,
  hasBusinessMark,
  isKnownUnreadable,
  maskForModel,
  maskNamesOf,
  parseCompanyRequest,
} from "@/lib/matters/policy";
import { getMatter, requireMatterUser } from "@/lib/matters/store";

/** 웹 검색·가져오기를 여러 번 하는 호출이라 길다 */
export const maxDuration = 150;

export const POST = withRoute(async (req, _ctx, scope) => {
  const user = await requireMatterUser(scope);
  const input = parseCompanyRequest(await readJson(req));
  const matter = await getMatter(user.userId, input.matterId);
  const names = maskNamesOf(matter.data, input.personNames);
  // 붙여 넣은 글은 이름·연락처를 가린 문장만 모델로 보낸다
  const pasted = input.pasted ? maskForModel(input.pasted, names) : null;
  if (pasted && pasted.sensitive.length > 0 && !input.consent) {
    throw new ApiError("CONSENT_REQUIRED", {
      kind: "sensitive_info",
      categories: pasted.sensitive,
    });
  }
  const pastedMasked = pasted?.text ?? "";
  // 외부 API를 부르기 전에 횟수를 본다 (횟수를 넘긴 뒤에도 외부 호출이 나가지 않게) — 네트워크 횟수와 사용자 하루 횟수 둘 다
  await assertRateLimit(BUSINESS_RATE, req.headers);
  await assertMatterAiRate(user);
  const lookup = () =>
    Promise.all([searchPlaces(input.name), searchCorps(input.name), searchBlogs(input.name)]);
  // 상호·기관 표지가 있는 이름은 공식 API를 먼저 찾아 검색 요약문을 모델에 함께 준다.
  // 표지 없이 "회사·기관 이름" 확인만으로 통과한 이름은 모델이 회사로 보고 조사한 뒤에만 찾는다 —
  // 무료 모드·예산 초과·모델 거절이면 그 이름을 네이버·금융위로 보내지 않는다 (개인 조사 금지)
  const marked = hasBusinessMark(input.name);
  const early = marked ? await lookup() : null;
  const blogsEarly = early?.[2] ?? null;
  // 자동으로 읽을 수 없는 것으로 확인된 링크는 도구에 넘기지 않고 바로 알린다 (본문 붙여 넣기 안내)
  const skipped = input.urls.filter(isKnownUnreadable);
  const urls = input.urls.filter((u) => !isKnownUnreadable(u));
  // 검색 요약문도 이름·연락처를 가린 뒤에만 모델로 보낸다
  const snippets = (blogsEarly?.items ?? []).map(
    (b) => maskForModel(`${b.title} — ${b.description}`.slice(0, 300), names).text,
  );

  const r = await runMatterAi(
    user,
    COMPANY_WEIGHT,
    () => researchCompany({ name: input.name, urls, pastedMasked, snippets, skipped }),
    { rateChecked: true },
  );
  const done = !r.skipped && r.out.ok ? r.out : null;
  // 모델이 사람을 가리키는 이름이라고 거절했으면 같은 이름으로 찾은 공식 자료·바로 가기도 내보내지 않는다 (개인 조사 금지)
  const person = !r.skipped && !r.out.ok && r.out.reason === "person";
  // 공식 자료를 보여 줄 수 있는 이름: 표지가 있거나, 모델이 회사로 보고 조사 결과를 낸 이름 (사람 거절은 언제나 아님)
  // 표지 없는 이름은 모델이 조사 결과를 낸 때만 (빈 결과는 회사라고 확인한 것이 아니다)
  const trusted = !person && (marked || (!r.skipped && r.out.ok));
  const none = { status: "empty" as const, items: [] };
  const [places, corps, blogs] = trusted ? (early ?? (await lookup())) : [none, none, none];
  const safeBlogs = {
    ...blogs,
    items: blogs.items.map((b) => ({
      ...b,
      title: maskForModel(b.title, names).text,
      description: maskForModel(b.description, names).text,
    })),
  };
  const res = ok(
    {
      report: done?.report ?? null,
      // sources = 도구가 실제로 읽은 페이지, found = 검색 결과에 나온 페이지(읽었다는 뜻은 아니다)
      sources: done?.sources ?? [],
      found: done?.found ?? [],
      // 사용자가 준 링크 중 읽지 못한 것 (자동 접근을 막은 사이트 등) — 본문을 붙여 넣어 달라고 안내한다
      unread: r.skipped ? input.urls : r.out.unread,
      official: { places, corps, blogs: safeBlogs },
      links: trusted ? businessLinks(input.name) : [],
      ai: r.skipped ?? (r.out.ok ? { used: true } : { used: false, reason: r.out.reason }),
      notice: done ? AI_NOTICE : null,
      sourceNotice: COMPANY_NOTICE,
    },
    scope.requestId,
  );
  res.headers.set("cache-control", "no-store");
  return res;
});
