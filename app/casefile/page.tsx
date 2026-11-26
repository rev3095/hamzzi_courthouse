// 사건 정리 (주 메뉴 '사건' → 정리, DEC-070 ③ — 예전 '서류 분석' F-015·DEC-052): 상황 글이나 서류 사진으로 DeepSearch 정리. 화면은 브라우저에서 동작한다.
import type { Metadata } from "next";
import { CaseFileAsk } from "@/components/casefile/CaseFileAsk";
import { CaseFileExampleList } from "@/components/casefile/CaseFileExampleList";

export const metadata: Metadata = { title: "사건 정리 · 햄찌법원" };

export default function CaseFilePage() {
  return (
    <main className="flex flex-1 flex-col">
      <CaseFileAsk examples={<CaseFileExampleList />} />
    </main>
  );
}
