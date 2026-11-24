// 분야별 비서 페이지 /assistants/[id] (F-018, DEC-057). 세 비서만 빌드 때 만든다.
// 주소 값은 <Suspense> 안의 클라이언트 부품이 읽는다 (cacheComponents — /cases/[id]와 같은 방식).
import type { Metadata } from "next";
import { Suspense } from "react";
import { AssistantRoute } from "@/components/assistants/AssistantPage";
import { ASSISTANT_IDS } from "@/lib/assistants/agents";

export const metadata: Metadata = { title: "전문 에이전트 · 햄찌법원" };

export function generateStaticParams() {
  return ASSISTANT_IDS.map((id) => ({ id }));
}

export default function Page() {
  return (
    <Suspense>
      <AssistantRoute />
    </Suspense>
  );
}
