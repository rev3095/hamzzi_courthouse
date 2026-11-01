"use client";
// GET /api/v1/me/quota — 남은 비로그인 질문 수. 질문·분석 후 notifyQuotaChanged()로 다시 읽는다.
import { useEffect, useState } from "react";
import { QUOTA_EVENT, getQuota, type Quota } from "@/lib/client/api";

export function useQuota(): Quota | null {
  const [quota, setQuota] = useState<Quota | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      getQuota().then((r) => {
        if (alive && r.ok) setQuota(r.data);
      });
    load();
    window.addEventListener(QUOTA_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(QUOTA_EVENT, load);
    };
  }, []);
  return quota;
}
