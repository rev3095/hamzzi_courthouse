---
name: figma-sync
description: 사용자가 Figma 링크(햄찌법원 디자인 파일)를 주고 화면 구현·디자인 반영·토큰 동기화를 요청할 때 사용. Figma를 그대로 구현하고 차이는 승인받게 한다.
---

# Figma → 코드 반영

기준: `docs/07_Figma_연동.md`. Figma가 디자인 기준이다. 디자인을 임의로 정하거나 바꾸지 않는다.

## 순서
1. **링크 확인** — fileKey와 node-id를 받는다. node-id가 없으면 프레임 링크(Copy link to selection)를 달라고 한다. 프레임 이름에서 화면 ID·상태·폭을 읽고 `docs/06_화면설계.md`의 해당 화면(F-ID·API·상태)을 확인한다.
2. **토큰** — `get_variable_defs`(nodeId `8:2` 또는 받은 프레임) 결과를 scratchpad에 JSON으로 저장 → `pnpm figma:tokens <파일>`. 차이가 있으면 `app/globals.css`의 `:root` 값과 `@theme inline` 이름을 고친다. 하드코딩 색 금지.
3. **화면** — Figma `figma-design-to-code` 스킬을 먼저 읽고 `get_design_context` + `get_screenshot`. 기본 출력(React+Tailwind)을 이 프로젝트 방식으로 옮긴다:
   - 색·반경은 토큰 유틸리티(`bg-bg`, `text-ink`, `rounded-panel` …), 글꼴은 `font-display`/`font-sans`/`font-accent`
   - 공통 UI는 `components/`, 화면은 `app/` 라우트. `app/api`·`lib`·`supabase`는 바꾸지 않는다
   - Next.js 코드는 AGENTS.md대로 `node_modules/next/dist/docs/`를 먼저 확인한다
   - 마스코트·아이콘: `download_assets`로 SVG → 장식은 `aria-hidden`, 색은 토큰
4. **절대 규칙 대조** — 아래와 충돌하면 고치지 말고 목록으로 묻는다:
   - AI 결과에 `AI_NOTICE` 고지, 법제처 출처 표기
   - "반드시·무조건·100%" 금지, 예시 숫자를 실제 값처럼 쓰지 않음
   - Pro·변호사 연결·소장 작성 등 F-013 게이트 전 기능은 구현하지 않음
   - 대비 4.5:1, 터치 44px, `prefers-reduced-motion`
5. **비교** — 개발 서버를 375·1440으로 띄워 캡처하고 Figma 스크린샷과 나란히 본다. 차이를 고치고, 남은 차이는 "어디 / 왜 / 제안" 표로 보고한다. Figma에 없는 상태·폭은 정하지 말고 프레임을 요청한다.
6. **마무리** — `pnpm lint`, `pnpm typecheck`, 관련 E2E. 화면이 바뀌었으면 `docs/06` 갱신 후 `pnpm docs:check`. PR 전 `legal-reviewer`.
