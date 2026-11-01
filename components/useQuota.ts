"use client";
// GET /api/v1/me/quota — 남은 비로그인 질문 수. 헤더·홈·이어 묻기가 한 저장소를 함께 본다.
// 질문·분석 후(notifyQuotaChanged), 화면 주소가 바뀔 때, 탭으로 돌아올 때 서버 값을 다시 읽는다.
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { QUOTA_EVENT, getQuota, type Quota } from "@/lib/client/api";

let current: Quota | null = null;
let seq = 0;
const listeners = new Set<() => void>();

/** 서버 값을 다시 읽는다. 늦게 도착한 이전 응답이 새 값을 덮지 않게 마지막 요청만 반영 */
export async function refreshQuota() {
  const mine = ++seq;
  const r = await getQuota();
  if (!r.ok || mine !== seq) return;
  current = r.data;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener(QUOTA_EVENT, refreshQuota);
    window.addEventListener("focus", refreshQuota);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener(QUOTA_EVENT, refreshQuota);
      window.removeEventListener("focus", refreshQuota);
    }
  };
}

/**
 * 화면 주소가 바뀔 때 서버 값을 다시 읽는다. usePathname은 동적 경로(/inquiries/[id])를 미리 렌더링할 때
 * 막히는 훅이라(cacheComponents), 이 컴포넌트를 <Suspense>로 감싸 쓴다 — SiteHeader 참고.
 */
export function QuotaRouteSync() {
  const pathname = usePathname();
  useEffect(() => {
    void refreshQuota();
  }, [pathname]);
  return null;
}

export function useQuota(): Quota | null {
  useEffect(() => {
    void refreshQuota();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
