"use client";
// 홈 질문 영역 (S-01): 질문창 + 안내 + 예시 질문 피드. 3회를 다 쓰면 누를 때 데모 한도 안내 (S-01 남은 질문 0, S-06 자리).
import { useState } from "react";
import { DEMO_LIMIT_TEXT } from "../LimitNotice";
import { ExampleFeed, type FeedExample } from "../ask/ExampleFeed";
import { QuestionBox } from "../ask/QuestionBox";
import { useAsk } from "../ask/useAsk";
import { useQuota } from "../useQuota";

export function HomeAsk({ examples }: { examples: FeedExample[] }) {
  const [text, setText] = useState("");
  const quota = useQuota();
  const { busy, error, send, modals, showLimit } = useAsk();
  const blocked = quota?.loginRequired === true;

  const submit = (q: string) => (blocked ? showLimit() : void send(q));

  return (
    <>
      <div className="w-full max-w-[820px]">
        <QuestionBox value={text} onChange={setText} onSubmit={() => submit(text)} busy={busy} />
        {error ? (
          <p role="alert" className="text-warn-text mt-3 text-sm">
            {error}
          </p>
        ) : (
          <p className="text-muted mt-3 text-[13px] leading-relaxed">
            {blocked
              ? DEMO_LIMIT_TEXT
              : "이름·전화번호 같은 개인정보는 빼고 적어 주세요. 데모에서는 3번까지 물어볼 수 있어요."}
          </p>
        )}
      </div>
      <div className="mt-12 w-full max-w-[1120px]">
        <ExampleFeed
          examples={examples}
          disabled={busy}
          onPick={(q) => {
            setText(q);
            submit(q);
          }}
        />
      </div>
      {modals}
    </>
  );
}
