// 보관함 정리 (DEC-072 ⓒ): 폴더·메모·내보내기. 이 기기(localStorage)에만 두는 공개 자료 목록이라 서버 호출이 없다.
import type { Metadata } from "next";
import { ShelfPage } from "@/components/search/ShelfPage";

export const metadata: Metadata = { title: "보관함 정리 · 햄찌법원" };

export default function Page() {
  return (
    <main className="flex flex-1 flex-col">
      <ShelfPage />
    </main>
  );
}
