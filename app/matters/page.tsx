// 사건 진행 (F-016, DEC-053): 로그인 사용자가 맡은 사건을 진행 순서대로 정리하는 화면. 화면은 브라우저에서 동작한다.
import type { Metadata } from "next";
import { MattersView } from "@/components/matters/MattersView";

export const metadata: Metadata = { title: "사건 진행 · 햄찌법원" };

export default function MattersPage() {
  return (
    <main className="flex flex-1 flex-col">
      <MattersView />
    </main>
  );
}
