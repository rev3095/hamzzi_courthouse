# lib/mascot — 햄찌 판사 상태별 그림 (브랜드 가이드 2.3)

화면은 상황에 맞는 상태를 `HamzziJudge mood=…`로 넘기고, 그 상태 그림이 없으면 기본 그림(`public/mascot/hamzzi-judge.webp`)을 쓴다.

| 파일 | 책임 |
|---|---|
| `moods.ts` | 상태 목록·설명·대사, `mascotSrc`(대체 규칙), `moodForError`(결과 화면 오류 코드 → 상태). 브라우저에서도 쓴다 |
| `manifest.json` | 상태 → 그림 파일 이름. 편집기가 고치고, 커밋해야 배포에 반영된다 |
| `policy.ts` | 순수 규칙: 편집기 접근(`studioAllowed` — 개발 서버·이 컴퓨터·같은 사이트만), webp 머리 검사(480×635, 800KB), 저장·기본 그림으로·되돌리기 전이 |
| `store.ts` | server-only 파일 저장. 지금 그림 `public/mascot/moods/<상태>-<해시>.webp`, 되돌리기 기록 `.studio/`(gitignore) |
| `view.ts` | 편집기 API 응답 모양 |

| 상태 | 쓰는 곳 |
|---|---|
| `default` 기본 | 홈 히어로 |
| `thinking` 분석 중 | 결과 화면 분석 진행 |
| `error` 오류 | 결과 화면 오류(검색·모델 실패, 시간 초과, 일시적 오류) |
| `sorry` 답변이 어려움 | 결과 없음, 하루 상한, 질문 3번 안내 |
| `ask` 재질문 필요 | 가린 문장 확인 필요 |
| `done` 기쁨 · `curious` 궁금함 · `calm` 차분 | 그림만 준비 (화면에 전신 자리가 아직 없음). `calm`은 움직이지 않는다 |

편집기: `pnpm studio`(이 컴퓨터에서만 받는 개발 서버) → `/studio`. 배포에서는 화면·API 모두 404다.

- `pnpm dev`는 같은 네트워크의 다른 기기 요청도 받는다. 브라우저 요청은 막지만 헤더를 꾸민 도구 요청까지 막지는 못하니, 그림을 바꿀 때는 `pnpm studio`를 쓴다.
- 저장한 그림과 `manifest.json` 변경은 `git status`에 보인다. 커밋 전에 내가 올린 그림인지 확인한다.
