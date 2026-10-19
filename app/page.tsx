// 자리 표시 홈. 실제 질문창·결과 화면은 Phase 1 UI 작업(F-001)에서 구현한다.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-ink text-5xl font-black">햄찌법원</h1>
      <p className="font-accent text-gold text-xl italic">Hamzzi Court</p>
      <p className="text-muted">준비 중입니다.</p>
    </main>
  );
}
