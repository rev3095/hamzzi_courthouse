import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, required } from "./env";

// service_role 키는 server-only 모듈인 이 파일에서만 읽는다 (env.ts는 browser.ts와 공용)
const serviceRoleKey = () =>
  required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * 요청 사용자 권한(RLS 적용) 클라이언트. 요청마다 새로 만든다.
 * Route Handler에서는 세션 갱신 쿠키를 쓸 수 있고, Server Component에서는 set이 실패하므로 무시한다.
 */
export async function createUserClient() {
  const { url, anonKey } = publicEnv();
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Component 렌더 중에는 쿠키를 쓸 수 없다. 세션 갱신은 Route Handler에서 일어난다.
        }
      },
    },
  });
}

/**
 * service_role 클라이언트 — RLS를 우회한다. 서버 코드에서만, 필요한 검사를 직접 한 뒤 쓴다.
 * 예: 판례 검색은 deid_check = 'passed'를 쿼리에 직접 건다 (lib/search/README.md).
 */
export function createServiceClient() {
  const { url } = publicEnv();
  return createClient(url, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
