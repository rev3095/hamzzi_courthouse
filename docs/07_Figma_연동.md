# 07. Figma 연동 — 디자인 기준 파일과 코드 반영 절차

> 화면 디자인의 기준은 아래 Figma 파일이다. Claude는 이 파일을 Figma 원격 MCP로 읽어 그대로 구현하고, 다르게 해야 하는 곳은 목록으로 먼저 승인받는다. 디자인을 임의로 정하거나 바꾸지 않는다.
> 도구 조사·비교: `docs/research/04_화면설계_도구_조사.md`

## 1. 파일

| 항목 | 값 |
|---|---|
| 파일 | 햄찌법원 디자인 — https://www.figma.com/design/0ULlXLG2c2OcHxAqVjN9sb |
| fileKey | `0ULlXLG2c2OcHxAqVjN9sb` |
| 위치 | Figma 팀 "202237052의 팀"(교육 플랜) 드래프트 |
| 출처 | 2026-10-22 디자인 캔버스 "AREO 디자인 시안"의 D+ 아트보드(`Hamzzi.dc.html`)를 상태별 정적 HTML로 풀어 `html_to_figma`로 옮김 |

### 페이지

| 페이지 | 내용 |
|---|---|
| 00 표지 · 작업 규칙 | 이 문서 2~4절 요약 (Figma 안에서 보는 규칙) |
| 01 IA · User Flow | 화면목록·흐름 (리디자인 ①에서 채움) |
| 02 Layout · Wireframe | 공통 틀·와이어프레임 (②③) |
| 03 Key Screen · D+ 원본 | 확정 시안 D+ 5프레임 — 홈 기본·분석 중·결과 × desktop-1440, 홈 기본·결과 × mobile-375 |
| 04 Foundations | 색·모서리 Variables 견본, Text Styles 견본 (노드 `8:2`) |
| 99 Archive | 지난 시안, 범위 밖 화면 |

### D+ 원본을 옮길 때 그대로 둔 것 (구현 전에 결정 필요)
옮기기는 원본과 같게 했다. 아래는 원본에 있던 내용이라 그대로 두었고, 구현 단계에서 사용자 결정이 필요하다.
- **게이트·Phase 2 요소**: 메뉴 "변호사 찾기"·"혼자 소송하기", 칩 "변호사 비교"·"소장 작성", 결과의 "변호사와 진행하기"·"혼자 진행하기(신청서 자동 작성)", CORE의 "수평적 변호사 마켓"·"소장 자동 작성". F-013 승인 전이라 구현하지 않는다 (절대 규칙 5).
- **예시 숫자**: "예상 기간 약 2~8개월", "예상 비용 약 7만~20만 원"은 시안용 예시. 실제 화면에서는 계산 함수·공식 기준 결과만 쓴다 (절대 규칙 3).
- **판례 카드**: "○○지방법원 · 20XX…(예시)"는 자리표시. 실제로는 검증된 근거만 렌더링한다 (절대 규칙 1).
- **"New" 배지**: 원본 CSS에서 `.mini span` 규칙이 `.new`보다 우선해 회색 14px 글자로 보인다. 원본과 같게 옮겼다. 의도대로(흰 11px) 고칠지 Figma에서 정한다.
- **AI 고지**: 원본 고지 문구는 실제 구현 시 `AI_NOTICE`(lib/api/respond.ts)로 바뀐다. 법제처 출처 표기 영역은 원본에 없다 → Figma에서 위치를 정해야 한다.
- 캔버스의 "프로토타입"(질문 → 무료/Pro 결과 → 신청서 → 변호사 잡마켓) 아트보드는 과금·변호사 연결 화면이라 옮기지 않았다.

## 2. 프레임 이름 규칙
- 형식: `<화면 ID 또는 시안명> / <화면 · 상태> / <mobile-375 | desktop-1440>`
- 예: `S-04 / 결과 · 판례 탭 / mobile-375`, `S-04 / 결과 · 결과 없음 / desktop-1440`
- 화면 ID는 `docs/06_화면설계.md`와 같다. 상태(기본·로딩·결과 없음·오류·개인정보 확인·LOGIN_REQUIRED)는 프레임을 따로 둔다.
- 모바일 375와 데스크톱 1440을 함께 둔다. 그 사이 폭 동작이 중요하면 768 프레임을 추가한다. 없으면 Claude가 정하지 않고 묻는다.

## 3. 토큰 대응

Figma 변수는 컬렉션 `hz tokens`(모드 `light`)에 있고, 각 변수의 WEB code syntax가 코드 이름이다. MCP `get_variable_defs` 결과 키가 그대로 `var(--이름)`으로 나온다.

| Figma 변수 | code syntax | 코드 (app/globals.css) | Tailwind |
|---|---|---|---|
| `color/bg` … `color/success-text` (11개) | `var(--bg)` … | `:root`의 `--bg` … | `bg-bg`, `text-ink`, `border-line` … (`@theme inline`의 `--color-*`) |
| `radius/panel` · `card` · `button` | `var(--radius-panel)` … | `@theme inline`의 `--radius-*` | `rounded-panel`, `rounded-card`, `rounded-button` |
| Text Styles `display/*`, `accent/*`, `body/*`, `caption` | — | `app/layout.tsx`의 `next/font` 변수 + 유틸리티 | `font-display`, `font-accent`, `font-sans` |

- 새 색이 필요하면 Figma에서 변수를 먼저 추가하고, code syntax를 `var(--새이름)`으로 둔다.
- 비교: `get_variable_defs`(fileKey, nodeId `8:2`) 결과를 파일로 저장한 뒤 `pnpm figma:tokens <파일>` — 바뀐 값·새 토큰을 보여 주고 차이가 있으면 exit 1. 기준 녹화본: `tests/fixtures/figma/variable-defs.json`.
- Variables REST API는 Enterprise 전용이라 쓰지 않는다. MCP로만 읽는다.

## 4. 작업 흐름

### 4.1 사용자가 Figma를 고친 뒤 코드에 반영 (기본 흐름)
1. Figma에서 수정한다. 2~3절 규칙(프레임 이름, 변수·스타일, Auto Layout)을 지킨다.
2. 바뀐 프레임을 우클릭 → **Copy link to selection** → Claude에게 링크와 함께 요청한다. 예: "이 프레임 구현해줘", "결과 탭 바뀐 거 반영해줘".
3. Claude는 `figma-sync` 스킬(.claude/skills/figma-sync) 순서로 작업한다.
   - 토큰: `get_variable_defs` → `pnpm figma:tokens` → `app/globals.css` 반영
   - 화면: `get_design_context` + `get_screenshot` → `components/`·`app/` 구현 (API·lib·DB는 바꾸지 않음)
   - 에셋: 마스코트·아이콘은 `download_assets`로 SVG를 받아 토큰 색으로 바꾼 컴포넌트로 만든다
4. 검증: 개발 서버 화면을 375·1440으로 캡처해 Figma 스크린샷과 나란히 비교하고, 남은 차이를 "어디 / 왜 / 제안"으로 보고한다. 사용자가 승인한 차이만 남긴다.
5. 절대 규칙과 충돌하는 디자인(1절 목록 같은 것)은 고치지 않고 먼저 묻는다.

### 4.2 코드에서 바뀐 것을 Figma에 되돌릴 때 (선택)
- 구현 화면을 Figma로 캡처하는 `generate_figma_design`, 정적 HTML을 옮기는 `html_to_figma`가 있다. 결과는 별도 프레임(예: `… / 구현 캡처`)으로 두고 원본 프레임을 덮어쓰지 않는다.

### 4.3 Claude가 Figma에 초안을 그릴 때 (리디자인 ①~③)
- `01`·`02` 페이지에 Auto Layout과 `hz tokens` 변수로 그린다. 사용자가 다듬은 뒤 4.1로 구현한다.

## 5. 연결·권한
- 등록: Claude Code에 Figma 공식 플러그인을 설치하거나 `claude mcp add --transport http figma https://mcp.figma.com/mcp`. 개인 OAuth라 저장소 `.mcp.json`에는 넣지 않는다.
- 현재 좌석은 **View**(교육 플랜). 드래프트 안의 파일은 Claude가 쓸 수 있다. 팀 프로젝트로 옮겨 쓰려면 Full 좌석이 필요하다 (교육 플랜은 무료 신청).
- 호출 한도: 읽기 도구만 센다. View·Collab 좌석은 월 20회, 교육 플랜은 Professional Full·Dev와 같은 하루 200회·분당 10회 — 어느 쪽이 적용되는지는 `whoami`로 확인한다. 쓰기 도구 일부(`create_new_file`, `generate_figma_design`, `whoami`)는 한도에서 빠진다. 한도에 걸리면 Full 좌석으로 바꾼다.
- Code Connect(컴포넌트 매핑)는 Organization·Enterprise 전용이라 쓰지 않는다. 컴포넌트 이름·variant 이름을 코드 props와 같게 지어 대신한다 (예: `HamzziJudge` — `size`, `mood`).
