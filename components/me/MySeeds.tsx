"use client";
// 내 씨앗 (DEC-047): 커뮤니티 글·댓글로 쌓인 포인트. 로그인 사용자에게만 보인다.
// 할인에 쓰는 기능은 과금 게이트 승인 전까지 꺼져 있어 잔액과 가치만 보여 준다(절대 규칙 5).
import Link from "next/link";
import { useEffect, useState } from "react";
import { getMySeeds } from "@/lib/client/community";
import { SEEDS, type SeedSummary } from "@/lib/community/policy";

const card = "rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-7 lg:py-7";
const won = (n: number) => n.toLocaleString("ko-KR");

export function MySeeds() {
  const [seeds, setSeeds] = useState<SeedSummary | null>(null);
  useEffect(() => {
    let live = true;
    void getMySeeds().then((r) => {
      if (live && r.ok && typeof r.data?.balance === "number") setSeeds(r.data);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section aria-labelledby="me-seeds" className={card}>
      <h2 id="me-seeds" className="text-ink text-lg font-bold">
        내 씨앗
      </h2>
      <p className="text-ink mt-2 text-[15px]" data-testid="me-seeds-balance">
        {seeds ? (
          <>
            <b>{won(seeds.balance)}개</b>
            <span className="text-muted"> · 할인 가치 {won(seeds.won)}원</span>
          </>
        ) : (
          <span className="text-muted">아직 모은 씨앗이 없어요.</span>
        )}
      </p>
      {seeds && (
        <p className="text-muted mt-1 text-[13px]">
          오늘 씨앗을 받은 글 {seeds.today.posts}/{seeds.today.postsLimit} · 댓글{" "}
          {seeds.today.comments}/{seeds.today.commentsLimit}
        </p>
      )}
      <p className="text-muted mt-2 text-[13px] leading-relaxed">
        커뮤니티에 글을 쓰면 씨앗 {SEEDS.post}개, 댓글을 쓰면 {SEEDS.comment}개가 쌓여요. 씨앗
        하나는 할인 {SEEDS.wonPerSeed}원의 가치이고, 유료 기능이 열리면 할인에 쓸 수 있어요. 지금은
        쌓이기만 하고, 현금으로 바꾸거나 다른 사람에게 줄 수는 없어요.
      </p>
      <Link
        href="/community"
        className="text-link mt-2 inline-block text-[14px] underline-offset-2 hover:underline"
      >
        커뮤니티로 가기
      </Link>
    </section>
  );
}
