# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 햄찌법원 (Hamzzi Court)

자연어로 설명한 법률 문제를 구조화하고 실제 법령·판례를 근거로 보여주는 AI 법률 정보 탐색 서비스. Phase 2에서 동의 기반 비식별 사건 게시로 변호사 상담 제안을 받는다.

## 제품 요구사항
- PRD: `docs/PRD.md` — 구현 전에 해당 **F-ID 절만** 읽는다. 전체를 읽지 않는다.
- 현재 단계: **Phase 1** (F-001~F-007, F-013) + F-014 절차 안내 데모판(DEC-021) + 문서 작성 `[게이트]`(DEC-022). 그 밖의 Phase 2 기능은 지시가 있을 때만 작업한다. 진행 상황은 `git log`와 PRD 0절을 본다.
- 지금은 **데모**를 먼저 만든다 (DEC-009~013): 판례·법령은 korean-law-mcp 실시간 조회, 결과 형식은 참고 프로토타입과 같게, 비로그인 3회.
- 절대 규칙 (PRD 3·8·10장 요약):
  1. 검증 근거에 없는 판례·조문·사건번호는 출력하지 않는다. 렌더링 전에 대조한다 (F-005). 데모의 검증 근거는 그 요청에서 법제처로부터 가져온 자료이고, 인용 구절 원문 일치와 `verify_citations` 재조회를 통과해야 한다 (DEC-009).
  2. 승소·처벌·해결 가능성을 확정 표현하지 않는다. "반드시", "무조건", "100%" 금지 (N1). **승률·성공 확률·유불리를 판단하는 기능·숫자·문구·게이지는 만들지 않는다** — 자리표시로도 넣지 않는다(사용자 재확인 2026-11-15). 허용: 단계별 "혼자 가능 / 전문가 권장" 라벨(DEC-002)과 "근거 판례 n건 · 관련 조문 n개" 같은 사실 표시.
  3. 기간·비용 숫자는 계산 함수나 공식 기준 결과만 쓴다. LLM이 숫자를 만들지 않는다. 조문·판례 원문 구절 안에 있는 숫자는 인용으로 쓸 수 있다.
  4. 개인정보는 프롬프트·로그·에러 메시지에 남기지 않는다 (F-007). 입력 원문은 DB에 저장하지 않고 마스킹본만 저장한다 (DEC-006).
  5. `[게이트]` 기능(F-010~F-012), 모든 과금, 법률문서 생성은 F-013 승인 전 비활성 상태로만 구현한다.
  6. 모든 AI 결과에 "AI 생성 · 법률 자문 아님"을 표시한다. 문구는 직접 쓰지 말고 `AI_NOTICE`(lib/api/respond.ts)를 쓴다.
  7. 비로그인은 **하루**(한국 시간 0시~24시, 0시 초기화) 해석이 필요한 실제 질문 **5회**(이어 묻기 포함, DEC-031 공모전 임시값 — 이전 3회, `ANON_QUESTION_LIMIT`)만 허용하고, 그 이후 요청은 서버에서 `LOGIN_REQUIRED`로 막는다 (DEC-005, DEC-010, DEC-024). 예외: **예시 질문**은 저장된 분석 재생(토큰 0)이라 횟수 검사·차감이 없다(DEC-027, 대신 같은 네트워크 1시간 30회), 관리자 모드(`/admin`, `ADMIN_PASSCODE`)는 횟수 제한이 없다. 관리자도 비용 상한은 그대로 받는다.
  8. **테스트를 진행하지 않는다 (사용자 절대 규칙, 2026-11-15).** 정말 필요할 때만 이유와 예상 금액을 먼저 말하고 확인받은 뒤 **1회만** 한다. Claude 생성 호출(messages)·배포 사이트에서 실제 질문·평가가 모두 해당한다. 돈이 들지 않는 로컬 검사(가짜 모델 단위 테스트·린트·타입 검사·`pnpm build`·`docs:check`)는 허용한다(2026-11-15 사용자 확인). 검증은 이 무료 검사와 무과금 토큰 세기(count_tokens)·모델 정보 조회로 한다.

## 문서 지도 (필요할 때만 읽기)
| 문서 | 언제 |
|---|---|
| `docs/PRD.md` | 기능 구현·수용 기준 확인 |
| `docs/ARCHITECTURE.md` | 컴포넌트 위치·책임, 외부 연동, 배포 |
| `docs/DATA_MODEL.md` | 테이블·마이그레이션·RLS·PII 태그 |
| `docs/API.md` | 엔드포인트·스키마·에러 코드 |
| `docs/05_브랜드_가이드.md` | UI 작업(색·글꼴·마스코트 규칙) |
| `docs/07_Figma_연동.md` | 화면 구현·디자인 반영. 디자인 기준은 Figma 파일이고, 반영은 `figma-sync` 스킬 순서로 |
| `docs/08_Google_Play_배포.md` | Android 앱(TWA, `twa/`)·Play 등록·앱 버전 올리기 |
| `docs/research/04_화면설계_도구_조사.md` | 화면설계 도구·MCP 선택 근거 |
| `docs/research/01_데이터_소스.md` | 데이터 수집기 작업 |
| `docs/research/03_규제_쟁점.md` | 게이트 기능·동의·과금 관련 작업 |
| `docs/research/05_공식_서식_출처.md` | 문서 작성 서식(공식 기관 서식·근거 조문·이용 조건) |
| `docs/research/06_카테고리_분류_조사.md` | 홈 카테고리·절차 섹션 분류 근거(생활법령 분야·판례 사건 종류) |
| `docs/01_AI_Native_개발_파이프라인.md` | 단계별 작업 방식·프롬프트 |
| `docs/03_PRD_햄찌법원.md` | 사용하지 않음 (대체된 이전 PRD) |

## 기술 스택 (확정, DEC-004)
Next.js 16(App Router) + TypeScript + Tailwind 4 · Supabase(Postgres + pgvector + Auth, 소셜 로그인) · Python 3.12 수집기(uv) · Claude API — 서비스 모델은 라이트 답변 **`claude-sonnet-5-5`**(DEC-026), 전체 파이프라인·문서 초안은 **`claude-haiku-5-5`**(DEC-019·020·023), 단가표 lib/ai/cost.ts
Next.js 코드를 쓰기 전에 @AGENTS.md 를 따른다 (이 버전은 학습 데이터와 API가 다르다).

## 명령어
필요 환경: Node 24+, pnpm 10+, Python 3.12 + uv, (로컬 DB) Docker.

| 목적 | 명령 |
|---|---|
| 개발 서버 / 빌드 | `pnpm dev` / `pnpm build` — **푸시 전 `pnpm build` 필수** (아래 코드 구조의 cacheComponents 참고, CI는 빌드를 돌리지 않는다) |
| 개발 전용 편집기 | `pnpm studio` → `http://127.0.0.1:3000/studio` (마스코트 상태 그림 교체·발표 자료 디자인). production에서는 404 |
| Figma 토큰 비교 | `pnpm figma:tokens` (globals.css ↔ Figma 변수, `figma-sync` 스킬) |
| 단위 테스트 | `pnpm test` — `tests/unit/**`와 `lib/**/*.test.ts`만 수집한다 (vitest.config.mts) |
| 단위 테스트 일부 | `pnpm exec vitest run lib/pii` · `pnpm exec vitest run tests/unit/inquiries-api.test.ts` · `pnpm exec vitest run -t "F-007 AC1"` |
| E2E 테스트 | `pnpm test:e2e` (처음 한 번 `pnpm exec playwright install chromium`). 개발 서버는 Playwright가 띄우고, 이미 떠 있으면 재사용한다 |
| E2E 일부 | `pnpm exec playwright test tests/e2e/home.spec.ts` |
| 법제처 실호출 스모크 | `pnpm test:live` (korean-law-mcp 어댑터 + 무료 모드, 무료. 등록 IP·`OPEN_LAW_API_KEY` 필요 — 기본 테스트에서 제외). Claude 실호출 테스트는 `ALLOW_PAID_API=1`일 때만 돌고 **별도 과금**되므로 사용자 허락 없이 실행 금지 |
| 린트 / 타입 / 포맷 | `pnpm lint` / `pnpm typecheck` / `pnpm format`. `typecheck`는 `next typegen`(라우트 타입 생성)을 먼저 실행한다. `tsc`를 직접 돌릴 때만 typegen을 따로 실행한다 |
| 문서 교차 검증 | `pnpm docs:check` (docs 수정 후 항상) |
| AI 평가 | `pnpm eval:demo` — **유료**(Claude 생성 호출). 절대 규칙 8에 따라 사용자 허락 없이 실행 금지 |
| Android 앱(TWA) | `pnpm android:version` / `pnpm android:bump patch "변경 내용"` / `pnpm android:build` — 웹 업데이트는 앱 재빌드 불필요, 앱 껍데기를 바꿀 때만 버전을 올린다 (docs/08 3.3절) |
| 수집기 테스트 | `pnpm collector:test` (pytest + ruff) |
| 수집기 테스트 일부 | `cd collector && uv run pytest tests/test_prec.py -k 중복` |
| DB 마이그레이션 | `pnpm exec supabase migration new <이름>` (add-migration 스킬) |
| 마이그레이션 적용 (개발 DB) | `pnpm db:push --dry-run` 확인 → `pnpm db:push`. `.env.local`의 개발용 Supabase 프로젝트에 적용한다 (Docker 불필요, 운영 DB 금지) |
| 적용 결과 검증 | `pnpm db:verify` — 테이블·RLS·권한·게이트·비로그인 횟수·인용 제약을 실제 DB에서 검사하고 ROLLBACK. 새 마이그레이션이면 scripts/verify_db.py에 검사를 추가한다 |
| 로컬 DB 초기화 | `pnpm exec supabase db reset` (Docker 필요) |
| CI | `.github/workflows/ci.yml` — push·PR에서 lint·typecheck·test·docs:check + 수집기 pytest·ruff check·ruff format --check. prettier·E2E·test:live·DB는 CI에서 돌지 않는다 |

## 환경변수 (`.env.local`, 값은 사용자가 직접 넣는다)
- `OPEN_LAW_API_KEY` 법제처 OC (lib/search, collector, test:live) · `ANTHROPIC_API_KEY` (lib/ai)
- `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(없으면 `NEXT_PUBLIC_SUPABASE_ANON_KEY`)·`SUPABASE_SERVICE_ROLE_KEY`(서버 전용) · `SUPABASE_DB_URL`(수집기 직접 접속, `pnpm db:push`·`pnpm db:verify`)
- `AI_MODE` 분석 모드 (DEC-015·019·020·026). Console API 크레딧이 별도 과금되므로 코드 기본값은 무료:
  - 없음/그 밖의 값 = **free**: Claude 호출 없음. 예시 질문은 저장된 답변 재생, 그 밖은 법제처 검색 결과만
  - `pro` = **라이트 답변**(DEC-020·026): 무료 법제처 검색 + 답변 1회. 답변 모델은 `AI_ANSWER_MODEL`
  - `pro-full` = 전체 파이프라인(의도·재검색·답변, DEC-019), 질문 1건 $0.015 상한. 명시할 때만
  - 유료 모드라도 예시 질문은 재생(비용 0). 유료 버전 보존 태그 `paid-ai-v1`
- `AI_ANSWER_MODEL` 라이트 답변 모델 (DEC-026, lib/ai/models.ts). 없음 = **`claude-sonnet-5-5`**(질문 1건 **$0.03** 상한, 2026-11-18 결정) · `claude-haiku-5-5`($0.0015). 목록 밖 값은 Haiku로. Opus·Fable은 생각을 끌 수 없어 허용하지 않는다
- `AI_WEEKLY_BUDGET_USD`(기본 **$80**, DEC-031 공모전 임시값 — 이전 $21) 유료 분석 주간 전체 금액 상한 — 하루 상한은 없다 (DEC-026, Max 월 $100 프로모션 크레딧을 다 쓸 수 있게). 건수 = 금액 ÷ 질문 1건 상한 → 라이트 Sonnet 주 2,666건. 넘으면 그 주는 무료 모드. 주간 창은 매주 토 09:00 KST 시작, 카운터는 8일 보관(마이그레이션 `20261117160154`). 예시 질문 재생은 세지 않는다
- `ADMIN_PASSCODE` 관리자 모드 비밀번호(DEC-024). 없으면 관리자 모드가 꺼진다. 저장소가 공개라 코드·문서에 값을 쓰지 않는다
- `ANON_IP_SALT` 비로그인 IP 해시용. 없으면 개발에서는 IP 상한이 꺼지고, production에서는 분석 마무리(`finishAnalysis`)·IP 사전 검사가 오류를 낸다

## 폴더
`app/` 화면·`app/api/v1/` API · `components/` 화면 컴포넌트(result·ask·search·documents·studio·guide) · `lib/{api,auth,inquiries,gate,pii,ai,demo,search,citations,calc,procedure,documents,mascot,guide,client,supabase}` 모듈(README가 있는 모듈은 README에 책임. `auth`·`inquiries`·`client`는 README 없음 — 아래 코드 구조 참고) · `twa/` Android 앱(TWA, Bubblewrap) · `collector/` Python 수집기 · `supabase/` DB · `tests/{unit,e2e,live,fixtures}` (live = 실호출, fixtures = 녹화한 외부 응답) · `evals/` AI 평가셋

## 코드 구조 (여러 파일에 걸친 규칙)
- 라우트는 `withRoute`(lib/api/route.ts)로 감싼다: requestId 부여, `ApiError` → 표준 에러, 그 밖의 예외 → `INTERNAL_ERROR`. 로그에는 본문·쿼리·예외 메시지를 남기지 않는다.
- lib 모듈은 `policy.ts`(순수 규칙, 단위 테스트 대상)와 `store.ts`(server-only, service_role DB 접근)로 나눈다. 라우트 테스트는 store·auth 모듈을 `vi.mock`으로 바꾼다 (`tests/unit/*-api.test.ts`).
- RLS는 사용자 테이블에 읽기 정책만 두고 쓰기는 서버(service_role)가 한다. 그래서 소유권 검사(`isOwner`)와 판례 `deid_check = 'passed'` 필터는 코드에서 직접 건다.
- Supabase 클라이언트는 두 가지다 (lib/supabase/server.ts). `createUserClient()` = 요청 사용자 세션·RLS 적용, `createServiceClient()` = service_role로 RLS 우회 — 쓰기와 store.ts 전용이고, 검사는 호출 코드가 직접 한다. 브라우저는 lib/supabase/browser.ts.
- 역할은 토큰이 아니라 서버가 `profiles.role`을 읽어 판단한다 (`getActor`·`requireRole`, lib/auth/server.ts). 비로그인은 `hz_anon` 쿠키 = `anon_sessions.id` (lib/auth/anon.ts).
- 게이트: Phase 2 엔드포인트 맨 앞에서 `requireFeature(key)`. 상태 변경은 DB 함수 `change_feature_gate`로만 가능하고(트리거가 직접 수정 차단), `gate_changes`·`audit_logs`는 append-only.
- 질문 입력: `scanInput` → 민감정보 가능성이 있으면 동의 전 저장하지 않고 409 → 마스킹본만 저장(`pii_findings` = `{findings, confirmedAt}`) → pii-confirmation → 분석.
- 비로그인 횟수: POST /inquiries는 3회를 다 썼는지 보기만 하고(`assertAnonQuota`), analyze는 모델 전에 세션·IP 상한을 미리 보고(`assertAnonQuota`·`assertAnonIpAvailable`), 차감은 분석·검증 성공 후 `finishAnalysis` → DB 함수 `finish_demo_analysis`가 결과 저장과 한 트랜잭션으로 `consume_anon_question`을 부른다(세션 하루 3회(`quota_day`, 한국 시간) + 같은 IP 해시 24시간 10회, `anon_usage`). `questions_used`를 직접 update하지 않는다. 관리자 모드(`hz_admin` 서명 쿠키, `lib/auth/admin-*`)면 `resolveOwner`가 `admin: true`를 붙이고 `countsAnonQuota`가 false라 검사·차감을 모두 건너뛴다. 예시 질문(`findExample`, lib/demo/policy.ts)은 두 라우트가 사전 검사를 건너뛰고 `finishAnalysis(…, { consumeAnonQuota: false })`로 저장만 한다(DEC-027) — 홈 화면도 같은 기준으로 3회를 다 써도 예시를 연다.
- 분석 모드: `lib/inquiries/analyze.ts`가 `aiMode()`(lib/ai/mode.ts)로 갈린다. free 또는 예시 질문 또는 주간 상한(`tryAiQuota`, lib/auth/rate-limit.ts · 금액은 lib/ai/models.ts) 초과 → `runFreeAnalysis`(lib/demo, Claude 없음). `pro` → `runLiteAnalysis`(lib/ai/lite.ts: `freeSearch` + `AI_ANSWER_MODEL` 답변 1회, 조문 6·판례 3건) + `verifyDraft`. `pro-full` → `runDemoAnalysis` + `verifyDraft`. `createModelClient`는 free에서 예외를 내고 SDK 재시도는 0(이중 과금 방지).
- 비용 상한: 모든 Claude 호출은 `withCostCap`(lib/ai/client.ts)을 거친다. 호출 전 무과금 `countTokens`로 입력을 재고 `planCall`(lib/ai/cost.ts)이 (쓴 비용 + 입력 + max_tokens 출력)이 상한 안일 때만 보낸다. 넘으면 `CostCapReached` — 라이트는 근거를 하나씩 빼고 다시 재고, 못 맞추면 AI 문단 없이 근거만 낸다. 키 점검은 `/api/v1/health`의 `ai.key`(모델 정보 조회, 무과금). **별도 과금 호출(Claude 실호출 테스트·평가)은 사용자의 명시적 허락 없이 하지 않는다** — `pnpm test:live`·`pnpm eval:demo`는 `ALLOW_PAID_API=1` 없이는 Claude 테스트를 건너뛴다.
- 데모 검색: 라우트·lib/ai는 `createLawSource()`(lib/search/law-source.ts)만 쓰고, 한 요청에서 가져온 근거는 `EvidenceSet`(lib/search/evidence.ts)에 모아 인용 검증기에 넘긴다. korean-law-mcp는 `serverExternalPackages`(next.config.ts)로 번들링에서 뺀다.
- 판례·법령 탐색(DEC-029): `createLawSource()`는 `LawSource`(분석·검증)와 `LawExplorer`(결정문·연혁·시점 조문·3단 비교·신구 대조·별표·자치법규·행정규칙)를 함께 돌려준다. 판례 밖 자료 16종(결정문 12 + 조약·학칙·공사공단·공공기관 규정·영문 법령)의 target·필드 이름·상세 항목은 `DECISION_DOMAINS`(explore.ts) 한 표에 있다 — 새 종류는 여기에만 더하고 실호출(`tests/live/explore.live.test.ts`)로 필드 이름을 확인한다. 순수 규칙은 lib/search/explore.ts, 화면은 `/search`(종류 탭·바로 가기)·`/research`(업무용 리서치: 목록 + 옆 미리보기 + 보관함)·`/laws/[name]`·`/decisions/[domain]/[id]`·`/ordinances/[id]`. 모두 LLM 없음 — `SEARCH_NOTICE`, 관련도·심각도·유불리 판정 없음(절대 규칙 2), 결정문은 요지 항목만(DEC-007 원칙), 인증키가 든 `/DRF/` 주소는 응답에 싣지 않는다. 검색어는 주소에 두지 않고 `sessionStorage`(`hz:sq`)로만 화면 사이에 건네며, 조회 이력·보관함(`hz:recent`·`hz:pins`)은 공개 자료의 제목·주소만 localStorage에 둔다. 공개 저장소 lexdiff(BSL 1.1)의 기능 목록만 참고했고 코드는 가져오지 않는다.
- `cacheComponents: true`(next.config.ts): `usePathname`·`useParams`·`useSearchParams` 같은 클라이언트 훅은 `<Suspense>` 안에서만 쓴다. 밖에서 쓰면 로컬 `pnpm dev`·CI는 통과해도 **Vercel 빌드가 프리렌더에서 실패**한다(예: 헤더 남은 질문 `QuotaRouteSync`).
- 홈 카테고리(lib/procedure/categories, DEC-028)는 분류 보조·무료 판례 검색어에만 쓰고 이 기기(sessionStorage)·analyze 본문 `category`로만 오간다(DB 저장 없음). 예시 질문은 `/examples/[id]` 정적 화면으로 바로 보여 주고 질문 생성·횟수 API를 부르지 않는다.
- 절차 타임라인(lib/procedure, DEC-021)은 LLM 없는 규칙 기반이다. 단계 문구에 숫자·단정 표현이 들어가면 `policy.test.ts`가 막는다. 결과(승패)를 판정하지 않는다.
- 문서 작성(lib/documents, DEC-022·025)은 `legal_documents` 게이트 뒤에 있다(게이트가 꺼져 있으면 관리자 모드 브라우저만 미리보기): API 맨 앞 `requireFeature`, 화면은 게이트가 꺼져 있으면 안내·공식 양식 링크만. 사용자 입력을 칸에 넣기만 하고 저장·로그하지 않는다. AI 생성물이 아니라 `AI_NOTICE` 대신 `DOCUMENT_NOTICE`. 초안 도우미(DEC-023, `POST /documents/{kind}/draft`)는 질문 번호만 받아 마스킹본으로 규칙 칸 + Haiku 사실관계 초안($0.0015)을 주고, 그때는 `AI_NOTICE` + `DRAFT_NOTICE`. 이름·주소·금액은 브라우저 밖으로 보내지 않는다(양식 채우기는 브라우저에서, 저장소·쿠키 없음). 서식 14종(임대차·사기·노동·분쟁조정·집행, 목록은 lib/documents/README.md)은 공식 기관 서식·법령 기준이고(사설 양식 금지, docs/research/05), 화면은 설문 팝업 → 완성 → 예/아니요 → 웹 편집기 → 저장 → 예/아니요, 내보내기 HWPX(한글 표준 구조로 직접 작성, 실험)·DOCX(자체 ZIP)·PDF(pdf-lib + public/fonts 나눔고딕)는 모두 브라우저 안에서 만든다. 주민등록번호·생년월일·입금 계좌는 받지 않는다. 새 서식은 `specs/<섹션>.ts` + `fill-<섹션>.ts`에 더한다.
- 브라우저 쪽 API 호출과 남은 질문 수는 lib/client/api.ts·components/useQuota.ts 한 저장소로 공유한다(헤더·홈·이어 묻기가 같은 값을 본다).
- server-only 모듈을 직접 import하는 테스트는 `vi.mock("server-only", () => ({}))`를 둔다. 외부 응답은 tests/fixtures에 줄여서 녹화하고, 실명은 가상 이름으로 바꾼다.

## 환경 주의
- Windows: Python 스크립트를 heredoc으로 넘기면 한글이 cp949로 깨진다. 파일로 저장해 `python -X utf8`로 실행한다.
- Docker가 없으면 SQL은 `uv run --no-project --with pglast` 파서로 문법만 확인할 수 있다 (적용 검증 아님).
- hook (.claude/settings.json): 편집 전 `protect.mjs`가 `.env*`(`.env.example` 제외)·`*.pem`·`*.key`·`secrets/` 편집을 막고, 편집 후 `format.mjs`가 ts·js·css·json에 prettier, ts·js에 `eslint --fix`, collector의 py에 `ruff format`을 자동 실행한다. 손으로 포맷을 맞출 필요는 없고, 편집 뒤 포맷 변경이 diff에 섞일 수 있다.
- `.env*`는 settings.json이 읽기도 막는다. 키가 필요한 스크립트는 실행 시 `.env.local`을 읽게 한다 (예: scripts/korean-law-mcp.mjs).
- korean-law-mcp는 두 가지로 쓴다 (DEC-009). ① `.mcp.json`의 MCP 서버는 Claude Code 개발 보조용. ② 서비스 코드는 MCP 프로토콜이 아니라 라이브러리 함수(`korean-law-mcp/lib/*`, `korean-law-mcp/tools/*`)를 서버에서 직접 import하고, 한 어댑터 모듈을 거쳐서만 호출한다. 실시간 조회한 판례 본문은 저장하지 않는다 (DEC-007).

## 스킬·리뷰어
- `add-crawler` 데이터 소스 추가 · `add-endpoint` API 추가 · `add-migration` DB 변경 · `figma-sync` Figma 디자인을 코드에 반영
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
