# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 햄찌법원 (Hamzzi Court)

자연어로 설명한 법률 문제를 구조화하고 실제 법령·판례를 근거로 보여주는 AI 법률 정보 탐색 서비스. Phase 2에서 동의 기반 비식별 사건 게시로 변호사 상담 제안을 받는다.

## 제품 요구사항
- PRD: `docs/PRD.md` — 구현 전에 해당 **F-ID 절만** 읽는다. 전체를 읽지 않는다.
- 현재 단계: **Phase 1** (F-001~F-007, F-013). Phase 2 기능은 지시가 있을 때만 작업한다. 진행 상황은 `git log`와 PRD 0절을 본다.
- 지금은 **데모**를 먼저 만든다 (DEC-009~013): 판례·법령은 korean-law-mcp 실시간 조회, 결과 형식은 참고 프로토타입과 같게, 비로그인 3회.
- 절대 규칙 (PRD 3·8·10장 요약):
  1. 검증 근거에 없는 판례·조문·사건번호는 출력하지 않는다. 렌더링 전에 대조한다 (F-005). 데모의 검증 근거는 그 요청에서 법제처로부터 가져온 자료이고, 인용 구절 원문 일치와 `verify_citations` 재조회를 통과해야 한다 (DEC-009).
  2. 승소·처벌·해결 가능성을 확정 표현하지 않는다. "반드시", "무조건", "100%" 금지 (N1).
  3. 기간·비용 숫자는 계산 함수나 공식 기준 결과만 쓴다. LLM이 숫자를 만들지 않는다. 조문·판례 원문 구절 안에 있는 숫자는 인용으로 쓸 수 있다.
  4. 개인정보는 프롬프트·로그·에러 메시지에 남기지 않는다 (F-007). 입력 원문은 DB에 저장하지 않고 마스킹본만 저장한다 (DEC-006).
  5. `[게이트]` 기능(F-010~F-012), 모든 과금, 법률문서 생성은 F-013 승인 전 비활성 상태로만 구현한다.
  6. 모든 AI 결과에 "AI 생성 · 법률 자문 아님"을 표시한다. 문구는 직접 쓰지 말고 `AI_NOTICE`(lib/api/respond.ts)를 쓴다.
  7. 비로그인은 질문 3회(이어 묻기 포함)만 허용하고, 그 이후 요청은 서버에서 `LOGIN_REQUIRED`로 막는다 (DEC-005, DEC-010).

## 문서 지도 (필요할 때만 읽기)
| 문서 | 언제 |
|---|---|
| `docs/PRD.md` | 기능 구현·수용 기준 확인 |
| `docs/ARCHITECTURE.md` | 컴포넌트 위치·책임, 외부 연동, 배포 |
| `docs/DATA_MODEL.md` | 테이블·마이그레이션·RLS·PII 태그 |
| `docs/API.md` | 엔드포인트·스키마·에러 코드 |
| `docs/05_브랜드_가이드.md` | UI 작업(색·글꼴·마스코트 규칙) |
| `docs/research/01_데이터_소스.md` | 데이터 수집기 작업 |
| `docs/research/03_규제_쟁점.md` | 게이트 기능·동의·과금 관련 작업 |
| `docs/01_AI_Native_개발_파이프라인.md` | 단계별 작업 방식·프롬프트 |
| `docs/03_PRD_햄찌법원.md` | 사용하지 않음 (대체된 이전 PRD) |

## 기술 스택 (확정, DEC-004)
Next.js 16(App Router) + TypeScript + Tailwind 4 · Supabase(Postgres + pgvector + Auth, 소셜 로그인) · Python 3.12 수집기(uv) · Claude API (후보: 메인 `claude-opus-5-5`, 분류·추출 `claude-haiku-5-5` — 모델은 PoC 후 확정)
Next.js 코드를 쓰기 전에 @AGENTS.md 를 따른다 (이 버전은 학습 데이터와 API가 다르다).

## 명령어
필요 환경: Node 24+, pnpm 10+, Python 3.12 + uv, (로컬 DB) Docker.

| 목적 | 명령 |
|---|---|
| 개발 서버 / 빌드 | `pnpm dev` / `pnpm build` |
| 단위 테스트 | `pnpm test` — `tests/unit/**`와 `lib/**/*.test.ts`만 수집한다 (vitest.config.mts) |
| 단위 테스트 일부 | `pnpm exec vitest run lib/pii` · `pnpm exec vitest run tests/unit/inquiries-api.test.ts` · `pnpm exec vitest run -t "F-007 AC1"` |
| E2E 테스트 | `pnpm test:e2e` (처음 한 번 `pnpm exec playwright install chromium`). 개발 서버는 Playwright가 띄우고, 이미 떠 있으면 재사용한다 |
| E2E 일부 | `pnpm exec playwright test tests/e2e/home.spec.ts` |
| 법제처 실호출 스모크 | `pnpm test:live` (korean-law-mcp 어댑터, 등록 IP·`OPEN_LAW_API_KEY` 필요 — 기본 테스트에서 제외) |
| 린트 / 타입 / 포맷 | `pnpm lint` / `pnpm typecheck` / `pnpm format`. `typecheck`는 `next typegen`(라우트 타입 생성)을 먼저 실행한다. `tsc`를 직접 돌릴 때만 typegen을 따로 실행한다 |
| 문서 교차 검증 | `pnpm docs:check` (docs 수정 후 항상) |
| 수집기 테스트 | `pnpm collector:test` (pytest + ruff) |
| 수집기 테스트 일부 | `cd collector && uv run pytest tests/test_prec.py -k 중복` |
| DB 마이그레이션 | `pnpm exec supabase migration new <이름>` (add-migration 스킬) |
| 마이그레이션 적용 확인 | `pnpm exec supabase db reset` (Docker 필요 — 없으면 미확인으로 보고) |
| CI | `.github/workflows/ci.yml` — push·PR에서 lint·typecheck·test·docs:check + 수집기 pytest·ruff check·ruff format --check. prettier·E2E·test:live·DB는 CI에서 돌지 않는다 |

## 환경변수 (`.env.local`, 값은 사용자가 직접 넣는다)
- `OPEN_LAW_API_KEY` 법제처 OC (lib/search, collector, test:live) · `ANTHROPIC_API_KEY` (lib/ai)
- `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`(서버 전용) · `SUPABASE_DB_URL`(수집기 직접 접속)
- `ANON_IP_SALT` 비로그인 IP 해시용. 없으면 개발에서는 IP 상한이 꺼지고, production에서는 `consumeAnonQuestion`이 오류를 낸다

## 폴더
`app/` 화면·`app/api/v1/` API · `lib/{api,auth,inquiries,gate,pii,ai,search,citations,calc,supabase}` 컴포넌트(README가 있는 모듈은 README에 책임. `auth`·`inquiries`는 README 없음 — 아래 코드 구조 참고) · `collector/` Python 수집기 · `supabase/` DB · `tests/{unit,e2e,live,fixtures}` (live = 실호출, fixtures = 녹화한 외부 응답) · `evals/` AI 평가셋

## 코드 구조 (여러 파일에 걸친 규칙)
- 라우트는 `withRoute`(lib/api/route.ts)로 감싼다: requestId 부여, `ApiError` → 표준 에러, 그 밖의 예외 → `INTERNAL_ERROR`. 로그에는 본문·쿼리·예외 메시지를 남기지 않는다.
- lib 모듈은 `policy.ts`(순수 규칙, 단위 테스트 대상)와 `store.ts`(server-only, service_role DB 접근)로 나눈다. 라우트 테스트는 store·auth 모듈을 `vi.mock`으로 바꾼다 (`tests/unit/*-api.test.ts`).
- RLS는 사용자 테이블에 읽기 정책만 두고 쓰기는 서버(service_role)가 한다. 그래서 소유권 검사(`isOwner`)와 판례 `deid_check = 'passed'` 필터는 코드에서 직접 건다.
- Supabase 클라이언트는 두 가지다 (lib/supabase/server.ts). `createUserClient()` = 요청 사용자 세션·RLS 적용, `createServiceClient()` = service_role로 RLS 우회 — 쓰기와 store.ts 전용이고, 검사는 호출 코드가 직접 한다. 브라우저는 lib/supabase/browser.ts.
- 역할은 토큰이 아니라 서버가 `profiles.role`을 읽어 판단한다 (`getActor`·`requireRole`, lib/auth/server.ts). 비로그인은 `hz_anon` 쿠키 = `anon_sessions.id` (lib/auth/anon.ts).
- 게이트: Phase 2 엔드포인트 맨 앞에서 `requireFeature(key)`. 상태 변경은 DB 함수 `change_feature_gate`로만 가능하고(트리거가 직접 수정 차단), `gate_changes`·`audit_logs`는 append-only.
- 질문 입력: `scanInput` → 민감정보 가능성이 있으면 동의 전 저장하지 않고 409 → 마스킹본만 저장(`pii_findings` = `{findings, confirmedAt}`) → pii-confirmation → 분석.
- 비로그인 횟수: POST /inquiries는 3회를 다 썼는지 보기만 하고(`assertAnonQuota`), 횟수는 analyze 성공 직후 `consumeAnonQuestion` → DB 함수 `consume_anon_question`만 올린다(세션 3회 + 같은 IP 해시 24시간 10회, `anon_usage`). `questions_used`를 직접 update하지 않는다.
- 데모 검색: 라우트·lib/ai는 `createLawSource()`(lib/search/law-source.ts)만 쓰고, 한 요청에서 가져온 근거는 `EvidenceSet`(lib/search/evidence.ts)에 모아 인용 검증기에 넘긴다. korean-law-mcp는 `serverExternalPackages`(next.config.ts)로 번들링에서 뺀다.
- server-only 모듈을 직접 import하는 테스트는 `vi.mock("server-only", () => ({}))`를 둔다. 외부 응답은 tests/fixtures에 줄여서 녹화하고, 실명은 가상 이름으로 바꾼다.

## 환경 주의
- Windows: Python 스크립트를 heredoc으로 넘기면 한글이 cp949로 깨진다. 파일로 저장해 `python -X utf8`로 실행한다.
- Docker가 없으면 SQL은 `uv run --no-project --with pglast` 파서로 문법만 확인할 수 있다 (적용 검증 아님).
- hook (.claude/settings.json): 편집 전 `protect.mjs`가 `.env*`(`.env.example` 제외)·`*.pem`·`*.key`·`secrets/` 편집을 막고, 편집 후 `format.mjs`가 ts·js·css·json에 prettier, ts·js에 `eslint --fix`, collector의 py에 `ruff format`을 자동 실행한다. 손으로 포맷을 맞출 필요는 없고, 편집 뒤 포맷 변경이 diff에 섞일 수 있다.
- `.env*`는 settings.json이 읽기도 막는다. 키가 필요한 스크립트는 실행 시 `.env.local`을 읽게 한다 (예: scripts/korean-law-mcp.mjs).
- korean-law-mcp는 두 가지로 쓴다 (DEC-009). ① `.mcp.json`의 MCP 서버는 Claude Code 개발 보조용. ② 서비스 코드는 MCP 프로토콜이 아니라 라이브러리 함수(`korean-law-mcp/lib/*`, `korean-law-mcp/tools/*`)를 서버에서 직접 import하고, 한 어댑터 모듈을 거쳐서만 호출한다. 실시간 조회한 판례 본문은 저장하지 않는다 (DEC-007).

## 스킬·리뷰어
- `add-crawler` 데이터 소스 추가 · `add-endpoint` API 추가 · `add-migration` DB 변경
- PR 전에 `legal-reviewer` 에이전트로 절대 규칙 위반을 검사한다.

## 작업 방식
- 큰 기능은 계획을 먼저 보여주고 승인 후 구현한다.
- 테스트 이름·커밋 메시지에 F-ID를 넣는다 (예: `F-003 AC2 결과 없음 안내`).
- PRD에 없는 결정이 필요하면 임의로 정하지 말고 PRD 16.1 오픈 이슈에 추가를 제안한다.
- 데이터 소스는 공식 API만 쓴다. 판결서 인터넷 열람은 수집하지 않고 링크만 제공한다.

## 금지
- `.env`, 비밀키, 실제 사용자 데이터 편집·출력
- robots.txt·이용약관이 금지한 소스 크롤링 코드
- 플랫폼이 변호사를 자동 배정하거나 수임 성사에 연동해 과금하는 코드 (DEC-001)
