// POST /api/v1/contact — 문의 남기기 (DEC-051).
// 비로그인도 쓸 수 있다. 본문은 개인정보를 가린 마스킹본만 개발자 메일로 보내고 저장하지 않는다. AI를 부르지 않는다.
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import type { ContactInput } from "@/lib/contact/policy";
import { submitContact } from "@/lib/contact/service";

export const POST = withRoute(async (req, _ctx, scope) => {
  const body = await readJson<ContactInput | null>(req);
  const res = ok(await submitContact(req.headers, body ?? {}), scope.requestId);
  res.headers.set("cache-control", "no-store");
  return res;
});
