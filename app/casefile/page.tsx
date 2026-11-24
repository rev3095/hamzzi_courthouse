// 서류 분석 (F-015, DEC-052): 서류 사진을 올려 사건 개요·쟁점·진행 절차를 본다. 화면은 브라우저에서 동작한다.
import type { Metadata } from "next";
import { CaseFileAsk } from "@/components/casefile/CaseFileAsk";
import { CaseFileExampleList } from "@/components/casefile/CaseFileExampleList";

export const metadata: Metadata = { title: "서류 분석 · 햄찌법원" };

export default function CaseFilePage() {
  return (
    <main className="flex flex-1 flex-col">
      <CaseFileAsk examples={<CaseFileExampleList />} />
    </main>
  );
}
