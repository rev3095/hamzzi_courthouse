// 실제 공식 API 호출로 법인·사업자 공개 정보 조회를 확인한다 (F-015 AC4, DEC-052). 실행: pnpm test:live (무료, Claude 호출 없음)
// 키(NAVER_CLIENT_ID·NAVER_CLIENT_SECRET, DATA_GO_KR_SERVICE_KEY)가 있는 출처만 돈다. 결과 내용은 출력하지 않고 형태만 확인한다.
// 여기서 실패하면 lib/business/policy.ts의 응답 필드 이름(공개 명세 기준)을 실제 응답에 맞게 고친다.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { searchCorps, searchPlaces } = await import("@/lib/business/source");

// 널리 알려진 공공기관 이름으로 형태만 본다 (개인 이름을 넣지 않는다)
const NAME = "한국전력공사";

describe.skipIf(!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET)(
  "네이버 지역 검색 API 실호출 (F-015 AC4)",
  () => {
    test("상호로 찾으면 제목이 있는 항목이 온다", async () => {
      const r = await searchPlaces(NAME);
      expect(r.status).toBe("ok");
      expect(r.items[0]?.title.length).toBeGreaterThan(0);
      expect(r.items.some((i) => i.address || i.roadAddress)).toBe(true);
    });
  },
);

describe.skipIf(!process.env.DATA_GO_KR_SERVICE_KEY)(
  "금융위원회 기업기본정보 실호출 (F-015 AC4)",
  () => {
    test("법인명으로 찾으면 법인명과 주소가 있는 항목이 온다", async () => {
      const r = await searchCorps(NAME);
      expect(r.status).toBe("ok");
      expect(r.items[0]?.corpName.length).toBeGreaterThan(0);
      expect(r.items.some((i) => i.address)).toBe(true);
    });
  },
);
