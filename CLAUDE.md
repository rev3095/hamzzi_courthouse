# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 햄찌법원 (Hamzzi Court)

자연어로 설명한 법률 문제를 구조화하고 실제 법령·판례를 근거로 보여주는 AI 법률 정보 탐색 서비스. Phase 2에서 동의 기반 비식별 사건 게시로 변호사 상담 제안을 받는다.

## 제품 요구사항
- PRD: `docs/PRD.md` — 구현 전에 해당 **F-ID 절만** 읽는다. 전체를 읽지 않는다.
- 현재 단계: **Phase 1** (F-001~F-007, F-013) + F-014 절차 안내 데모판(DEC-021) + 문서 작성 `[게이트]`(DEC-022) + F-015 서류 분석(DEC-052) + F-016 사건 진행(DEC-053). 그 밖의 Phase 2 기능은 지시가 있을 때만 작업한다. 진행 상황은 `git log`와 PRD 0절을 본다.
- 지금은 **데모**를 먼저 만든다 (DEC-009~013): 판례·법령은 korean-law-mcp 실시간 조회, 결과 형식은 참고 프로토타입과 같게, 비로그인 하루 횟수 제한(절대 규칙 7).
- 절대 규칙 (PRD 3·8·10장 요약):
  1. 검증 근거에 없는 판례·조문·사건번호는 출력하지 않는다. 렌더링 전에 대조한다 (F-005). 데모의 검증 근거는 그 요청에서 법제처로부터 가져온 자료이고, 인용 구절 원문 일치와 `verify_citations` 재조회를 통과해야 한다 (DEC-009).
  2. 승소·처벌·해결 가능성을 확정 표현하지 않는다. "반드시", "무조건", "100%" 금지 (N1). **승률·성공 확률·유불리를 판단하는 기능·숫자·문구·게이지는 만들지 않는다** — 자리표시로도 넣지 않는다(사용자 재확인 2026-11-15). 허용: 단계별 "혼자 가능 / 전문가 권장" 라벨(DEC-002)과 "근거 판례 n건 · 관련 조문 n개" 같은 사실 표시.
  3. 기간·비용 숫자는 계산 함수나 공식 기준 결과만 쓴다. LLM이 숫자를 만들지 않는다. 조문·판례 원문 구절 안에 있는 숫자는 인용으로 쓸 수 있다.
  4. 개인정보는 프롬프트·로그·에러 메시지에 남기지 않는다 (F-007). 입력 원문은 DB에 저장하지 않고 마스킹본만 저장한다 (DEC-006). **예외 하나**(DEC-052, 사용자 결정 2026-11-24): 서류 사진(F-015)은 미리 가릴 수 없어, 사진 전송·민감정보 동의를 모두 받은 요청에서만 판독 호출 1회에 그대로 보낸다 — 사진·판독 원문은 저장·로그하지 않고 가린 사건 개요만 내보낸다. **PDF도 사진과 같이 그대로 보낸다**(사용자 결정 2026-11-24, 동의 화면에 명시). 한글·워드·파워포인트·엑셀·텍스트 문서는 브라우저에서 글만 꺼내 서버가 가린 뒤 보낸다(사진·문서 합쳐 30개, PDF 20쪽). 개인의 이름은 내보내지 않고, 개인을 찾는 검색은 만들지 않는다. **예외 둘**(DEC-053, 사용자 결정 2026-11-24): 사건 진행(F-016)은 로그인 사용자가 본인 사건을 정리하는 도구라 사건 자료에 서류의 이름을 가리지 않고 계정별로 저장·표시한다 — 연락처·등록번호·계좌·주소 꼴은 가리고, 사진은 저장하지 않으며, 모델에 보내는 글은 이름까지 가린 문장만 쓴다(가릴 이름은 서버가 저장된 사건의 당사자에서 모은다). 기업 조사 결과에는 공개 자료에 적힌 **대표자 이름 한 항목**만 남길 수 있다(사용자 결정 2026-11-24) — 임직원·개인 이름, 연락처는 적지 않고, 사람 이름은 조사 대상으로 받지 않는다(상호·기관 표지 없는 이름은 회사라는 확인 + 모델 거절 규칙). 이 예외는 `matters` 테이블과 `/matters` 화면에만 해당한다.
  5. `[게이트]` 기능(F-010~F-012), 모든 과금, 법률문서 생성은 F-013 승인 전 비활성 상태로만 구현한다.
  6. 모든 AI 결과에 "AI 생성 · 법률 자문 아님"을 표시한다. 문구는 직접 쓰지 말고 `AI_NOTICE`(lib/api/respond.ts)를 쓴다.
  7. 비로그인은 **하루**(한국 시간 0시~24시, 0시 초기화) 해석이 필요한 실제 질문 **5회**(이어 묻기 포함, DEC-031 공모전 임시값 — 이전 3회, `ANON_QUESTION_LIMIT`)만 허용하고, 그 이후 요청은 서버에서 `LOGIN_REQUIRED`로 막는다 (DEC-005, DEC-010, DEC-024). 예외: **예시 질문**은 저장된 분석 재생(토큰 0)이라 횟수 검사·차감이 없다(DEC-027, 대신 같은 네트워크 1시간 30회), 관리자 모드(`/admin`, `ADMIN_PASSCODE`)는 횟수 제한이 없다. 관리자도 비용 상한은 그대로 받는다. 로그인은 **Google로만** 하고, 로그인 사용자는 하루 **10회**(`USER_QUESTION_LIMIT`, DEC-035).
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
| `docs/08_Google_Play_배포.md` | Android 앱(Capacitor, `mobile/`)·Play 등록·앱 버전 올리기 |
| `docs/research/04_화면설계_도구_조사.md` | 화면설계 도구·MCP 선택 근거 |
| `docs/research/01_데이터_소스.md` | 데이터 수집기 작업 |
| `docs/research/03_규제_쟁점.md` | 게이트 기능·동의·과금 관련 작업 |
| `docs/research/05_공식_서식_출처.md` | 문서 작성 서식(공식 기관 서식·근거 조문·이용 조건) |
| `docs/research/06_카테고리_분류_조사.md` | 홈 카테고리·절차 섹션 분류 근거(생활법령 분야·판례 사건 종류) |
| `docs/reports/` | 날짜별 분석·결정 보고서(모델·비용 비교, 배포 롤백·운영 모니터링 절차, 질문 해석·섹션 라벨). 비용·모델을 바꾸기 전에 해당 보고서 |
| `docs/01_AI_Native_개발_파이프라인.md` | 단계별 작업 방식·프롬프트 |
| `docs/03_PRD_햄찌법원.md` | 사용하지 않음 (대체된 이전 PRD) |

## 기술 스택 (확정, DEC-004)
Next.js 16(App Router) + TypeScript + Tailwind 4 · Supabase(Postgres + pgvector + Auth, 로그인은 Google만 — DEC-035) · Python 3.12 수집기(uv) · Claude API — 답변 모델은 사용자가 고른 단계(DEC-036: Light `claude-haiku-5-5` · Pro `claude-sonnet-5-5` · Pro Max `claude-opus-5-5`), 문서 초안·절차 분류는 **`claude-haiku-5-5`**(DEC-023·033), 단가표 lib/ai/cost.ts
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
| 린트 / 타입 / 포맷 | `pnpm lint` / `pnpm typecheck` / `pnpm format`. `typecheck`는 `next typegen`(라우트 타입 생성)을 먼저 실행한다. `tsc`를 직접 돌릴 때만 typegen을 따로 실행한다. `pnpm lint`·`pnpm format`(`prettier --write .`)은 `.claude/worktrees/**`(다른 세션의 작업 폴더)까지 훑는다 — 내 변경만 보려면 `pnpm exec eslint app components lib tests`, 포맷은 `pnpm exec prettier --write <고친 파일>` |
| 문서 교차 검증 | `pnpm docs:check` (docs 수정 후 항상) |
| AI 평가 | `pnpm eval:demo` — **유료**(Claude 생성 호출). 절대 규칙 8에 따라 사용자 허락 없이 실행 금지 |
| 예시 답변 만들기·반영 | `scripts/gen-examples.mjs` — **유료**(질문마다 Opus 답변 + Haiku 해석, 관리자 모드 서버 대상, 사용법은 파일 머리말). 사용자 허락 없이 실행 금지. 반영은 무료 `python -X utf8 scripts/merge_examples.py`(검증 통과 문단만 `lib/demo/examples.json`·카테고리에 넣는다) |
| 배포 사이트 실답변 비교 | `scripts/live-compare.mjs` — **유료**(배포 사이트 실제 질문 1건). 사용자 허락 후 1회만 |
| 앱(Capacitor, DEC-048·049) | `pnpm app:dev`(화면 미리보기 5190) / `pnpm app:preview`(한 파일 미리보기 `mobile/dist-preview/app.html`) / `pnpm app:version` / `pnpm app:bump patch "변경 내용"` / `pnpm app:apk`(디버그 APK·서명 전 AAB → `mobile/out/`) — 앱 안 코드(`mobile/src`·`lib/reader`·`lib/procedure`·`lib/pii`·예시)가 바뀌면 다시 빌드해 올린다 (docs/08 3.3절). 판독 정확도 `pnpm reader:score`(무료). 처음 방식 TWA(`twa/`, `pnpm android:*`)는 남겨 두었지만 올리지 않는다 |
| 수집기 테스트 | `pnpm collector:test` (pytest + `ruff check`). CI는 `ruff format --check`도 돌리므로 수집기를 고쳤으면 `cd collector && uv run ruff format --check .`도 확인한다 |
| 수집기 테스트 일부 | `cd collector && uv run pytest tests/test_prec.py -k 중복` |
| DB 마이그레이션 | `pnpm exec supabase migration new <이름>` (add-migration 스킬) |
| 마이그레이션 적용 (개발 DB) | `pnpm db:push --dry-run` 확인 → `pnpm db:push`. `.env.local`의 개발용 Supabase 프로젝트에 적용한다 (Docker 불필요, 운영 DB 금지) |
| 적용 결과 검증 | `pnpm db:verify` — 테이블·RLS·권한·게이트·비로그인 횟수·인용 제약을 실제 DB에서 검사하고 ROLLBACK. 새 마이그레이션이면 scripts/verify_db.py에 검사를 추가한다 |
| 로컬 DB 초기화 | `pnpm exec supabase db reset` (Docker 필요) |
| CI | `.github/workflows/ci.yml` — push·PR에서 lint·typecheck·test·docs:check + 수집기 pytest·ruff check·ruff format --check. prettier·E2E·test:live·DB는 CI에서 돌지 않는다 |

## 환경변수 (`.env.local`, 값은 사용자가 직접 넣는다)
- `OPEN_LAW_API_KEY` 법제처 OC (lib/search, collector, test:live) · `LAW_OC` 개발용 MCP 서버만 읽는 OC(없으면 `OPEN_LAW_API_KEY`) · `ANTHROPIC_API_KEY` (lib/ai)
- `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(없으면 `NEXT_PUBLIC_SUPABASE_ANON_KEY`)·`SUPABASE_SERVICE_ROLE_KEY`(서버 전용) · `SUPABASE_DB_URL`(수집기 직접 접속, `pnpm db:push`·`pnpm db:verify`)
- `AI_MODE` 유료 답변을 끄는 스위치 (DEC-015·036, lib/ai/mode.ts). **답변 모델은 환경변수가 아니라 사용자가 질문마다 고른다** — `AI_MODE=pro`·`pro-full`·`AI_ANSWER_MODEL`은 폐기했고 더 읽지 않는다:
  - `free` = Claude 호출 없음. 예시 질문은 저장된 답변 재생, 그 밖은 법제처 검색 결과만
  - 없음/그 밖의 값 = **유료**: 사용자가 고른 단계로 답변. 단, `ANTHROPIC_API_KEY`가 없으면 무료(CI·키 없는 개발 환경 보호)
  - 로컬 `.env.local`에 키가 있으면 로컬에서도 실제 질문이 과금된다 — 로컬에서 화면만 볼 때는 `AI_MODE=free`
  - 유료 모드라도 예시 질문은 재생(비용 0). 유료 버전 보존 태그 `paid-ai-v1`
- 답변 단계 (DEC-036, lib/ai/models.ts `TIERS`): **Light** Haiku 5.5 $0.002(2026-11-19 $0.0015에서 올림) · **Pro** Sonnet 5.5 $0.03 · **Pro Max** Opus 5.5 $0.25(**기본**, DEC-050 — 이전 기본 Pro·상한 $0.15, DeepSearch $0.5, effort medium, 실측 전). 질문창 아래 슬라이더(components/ask/TierSlider)로 고르고 이 기기에만 기억한다(`hz:tier`)
- `AI_WEEKLY_BUDGET_USD`(기본 **$80**, DEC-031 공모전 임시값 — 이전 $21) 유료 분석 주간 전체 금액 상한 — 하루 상한은 없다 (DEC-026, Max 월 $100 프로모션 크레딧을 다 쓸 수 있게). 건수가 아니라 **단위($0.0015)**로 센다(DEC-036): Light 2 · Pro 20 · Pro Max 100 · 문서 초안·절차 분류 1 → $80 = 53,333단위 (가중치 = 상한 ÷ 단위 올림, Light $0.002 → 2). 넘으면 그 주는 무료 모드. 주간 창은 매주 토 09:00 KST 시작, 카운터는 8일 보관(마이그레이션 `20261117160154`), 가중 차감 함수는 마이그레이션 `20261118143933`. 예시 질문 재생은 세지 않는다
- `AI_PERIOD_BUDGET_USD`(기본 **$95**, DEC-040 — 2026-11-20 잠깐 $80이었다가 사용자 확인으로 되돌림) **2026-11-25 24시(한국 시간)까지**는 위 주간 상한 대신 이 기간 예산 하나로 센다(lib/ai/models.ts `PERIOD_BUDGET`·`periodBudget`). 상한이 아니라 **실제로 쓴 금액**만 차감한다: `tryAiQuota`가 호출 전에 단계 상한을 먼저 잡고(`reserve_ai_budget`) `settleAiQuota`가 답변 뒤 차액을 돌려준다(`settle_ai_budget`, 마이그레이션 `20261118210000`). $95에 닿으면 기간 끝까지 무료 모드. 기간이 끝나면 주간 규칙으로 돌아간다. Claude를 부르는 새 경로를 만들면 `tryAiQuota` 뒤에 `settleAiQuota(가중치, 실제 비용)`을 꼭 부른다
- `ADMIN_PASSCODE` 관리자 모드 비밀번호(DEC-024). `ADMIN_PASSWORD`라는 이름도 받는다(둘 다 있으면 `ADMIN_PASSCODE`). 둘 다 없으면 관리자 모드가 꺼진다. 저장소가 공개라 코드·문서에 값을 쓰지 않는다
- `NEXT_PUBLIC_GOOGLE_LOGIN` `1`이면 Google 로그인 버튼을 켠다(DEC-035). 빌드 때 들어가므로 바꾸면 다시 배포. Supabase에 Google 공급자·돌아올 주소를 먼저 설정한다 — `?next=`가 붙으므로 허용 주소는 `https://<도메인>/auth/callback**`처럼 와일드카드로. 꺼져 있으면 `/auth/callback`도 세션을 만들지 않는다
- `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`(네이버 개발자센터, 지역 검색 API) · `DATA_GO_KR_SERVICE_KEY`(공공데이터포털 금융위원회_기업기본정보) F-015 법인·사업자 공개 정보 조회(DEC-052). 없으면 그 출처는 꺼지고 바로 가기 링크만 보인다
- `RESEND_API_KEY` 문의 남기기 메일 발송(DEC-051, lib/contact/send.ts). 없으면 화면이 메일 앱 열기(mailto)로 바꾸고 개인정보처리방침도 발송 업체를 적지 않는다(빌드 때 읽으므로 바꾸면 다시 배포). `CONTACT_FROM` 발신 주소(없으면 Resend 테스트 발신 주소 — Resend에 가입한 본인 메일로만 보낼 수 있으니 개발자 메일로 가입)
- `ANON_IP_SALT` 비로그인 IP 해시용. 없으면 개발에서는 IP 상한이 꺼지고, production에서는 분석 마무리(`finishAnalysis`)·IP 사전 검사가 오류를 낸다

## 폴더
`app/` 화면·`app/api/v1/` API · `components/` 화면 컴포넌트(home·result·ask·casefile·matters·search·documents·studio·guide·me·community·about) · `lib/{api,auth,inquiries,gate,pii,ai,demo,community,casefile,business,matters,search,citations,calc,procedure,documents,mascot,guide,reader,client,supabase,about,contact}` 모듈(README가 있는 모듈은 README에 책임. `auth`·`inquiries`·`client`·`about`·`contact`는 README 없음 — 아래 코드 구조 참고) · `mobile/` 앱(Capacitor android·ios, 오프라인 판독 `lib/reader`) · `twa/` 처음 방식(TWA, 올리지 않음) · `collector/` Python 수집기 · `supabase/` DB · `tests/{unit,e2e,live,fixtures}` (live = 실호출, fixtures = 녹화한 외부 응답) · `evals/` AI 평가셋

## 코드 구조 (여러 파일에 걸친 규칙)
- 라우트는 `withRoute`(lib/api/route.ts)로 감싼다: requestId 부여, `ApiError` → 표준 에러, 그 밖의 예외 → `INTERNAL_ERROR`. 로그에는 본문·쿼리·예외 메시지를 남기지 않는다.
- lib 모듈은 `policy.ts`(순수 규칙, 단위 테스트 대상)와 `store.ts`(server-only, service_role DB 접근)로 나눈다. 라우트 테스트는 store·auth 모듈을 `vi.mock`으로 바꾼다 (`tests/unit/*-api.test.ts`).
- RLS는 사용자 테이블에 읽기 정책만 두고 쓰기는 서버(service_role)가 한다. 그래서 소유권 검사(`isOwner`)와 판례 `deid_check = 'passed'` 필터는 코드에서 직접 건다.
- Supabase 클라이언트는 두 가지다 (lib/supabase/server.ts). `createUserClient()` = 요청 사용자 세션·RLS 적용, `createServiceClient()` = service_role로 RLS 우회 — 쓰기와 store.ts 전용이고, 검사는 호출 코드가 직접 한다. 브라우저는 lib/supabase/browser.ts.
- 역할은 토큰이 아니라 서버가 `profiles.role`을 읽어 판단한다 (`getActor`·`requireRole`, lib/auth/server.ts). 비로그인은 `hz_anon` 쿠키 = `anon_sessions.id` (lib/auth/anon.ts).
- 게이트: Phase 2 엔드포인트 맨 앞에서 `requireFeature(key)`. 상태 변경은 DB 함수 `change_feature_gate`로만 가능하고(트리거가 직접 수정 차단), `gate_changes`·`audit_logs`는 append-only.
- 질문 입력: `scanInput` → 민감정보 가능성이 있으면 동의 전 저장하지 않고 409 → 마스킹본만 저장(`pii_findings` = `{findings, confirmedAt}`) → pii-confirmation → 분석.
- 비로그인 횟수: POST /inquiries는 하루 횟수를 다 썼는지 보기만 하고(`assertAnonQuota`), analyze는 모델 전에 세션·IP 상한을 미리 보고(`assertAnonQuota`·`assertAnonIpAvailable`), 차감은 분석·검증 성공 후 `finishAnalysis` → DB 함수 `finish_demo_analysis`가 결과 저장과 한 트랜잭션으로 `consume_anon_question`을 부른다(세션 하루 `ANON_QUESTION_LIMIT`회(`quota_day`, 한국 시간) + 같은 IP 해시 `ANON_IP_WINDOW` 동안 `ANON_IP_DAILY_LIMIT`회, `anon_usage`). 한도 숫자는 lib/inquiries/policy.ts 상수가 DB 함수 인자(`p_session_limit`·`p_ip_limit`)로 넘어가므로, 바꿀 때 마이그레이션은 필요 없고 문서에 숫자를 따로 적지 않는다. `questions_used`를 직접 update하지 않는다. 관리자 모드(`hz_admin` 서명 쿠키, `lib/auth/admin-*`)면 `resolveOwner`가 `admin: true`를 붙이고 `countsAnonQuota`가 false라 검사·차감을 모두 건너뛴다. 예시 질문(`findExample`, lib/demo/policy.ts)은 두 라우트가 사전 검사를 건너뛰고 `finishAnalysis(…, { consumeAnonQuota: false })`로 저장만 한다(DEC-027) — 홈 화면도 같은 기준으로 하루 횟수를 다 써도 예시를 연다.
- 로그인 사용자 횟수(DEC-035): `countsUserQuota(owner)`면 POST /inquiries와 analyze가 모델 전에 `assertUserQuota(getUserQuestionsUsed)`로 하루 `USER_QUESTION_LIMIT`회를 본다. 별도 카운터가 없고, 오늘(한국 시간) 그 사용자의 `analysis_results` 중 재생(`model = 'replay'`)이 아닌 행 수를 센다 — 그래서 차감 함수가 따로 없다. 예시 질문은 세지 않는다.
- Google 로그인(DEC-035): 브라우저 `signInWithGoogle`(lib/client/login.ts, Supabase OAuth PKCE) → `app/auth/callback/route.ts`가 코드를 세션 쿠키로 바꾸고 `safeNextPath`(lib/auth/next-path.ts, 사이트 안 경로만)로 돌려보낸다. `NEXT_PUBLIC_GOOGLE_LOGIN`이 꺼져 있으면 버튼은 "준비 중"이고 콜백도 세션을 만들지 않는다. 로그인 여부는 화면이 직접 판단하지 않고 서버의 `GET /me/quota`(`anonymous: false`)만 본다(`isSignedIn`, lib/client/api.ts). `resolveOwner`는 로그인 사용자에게 이 브라우저의 기존 익명 세션도 붙여(`Owner.anonSessionId`) 로그인 전 질문을 계속 보게 하고, 그 질문을 분석하면 먼저 `claimInquiryForUser`로 계정에 연결한다. 로그인 사용자 하루 한도는 아래 '로그인 사용자 횟수'. 관리자 모드는 로그인 여부와 따로 붙는다(`Owner.admin`).
- 분석 모드: `lib/inquiries/analyze.ts`가 `aiMode()`(lib/ai/mode.ts)로 갈린다. free 또는 예시 질문 또는 주간 상한·기간 예산(DEC-040, 2026-11-25까지)(`tryAiQuota(단계 가중치)`, lib/auth/rate-limit.ts · 금액은 lib/ai/models.ts) 초과 → `runFreeAnalysis`(lib/demo, Claude 없음). 그 밖에는 요청 본문의 `tier`(없으면 Pro)로 `runLiteAnalysis`(lib/ai/lite.ts: 질문 해석 Haiku 1회(DEC-033: 섹션 라벨 + 검색어, 같은 질문 1건 상한 안) → `freeSearch` → 그 단계 모델 답변 1회, 조문 6·판례 3건) + `verifyDraft`. `createModelClient`는 free에서 예외를 내고 SDK 재시도는 0(이중 과금 방지). 전체 파이프라인 `runDemoAnalysis`는 코드에 남아 있지만 분석 경로에서 쓰지 않는다(DEC-036).
- 내 질문 기록(DEC-039): 로그인은 배포된 DEC-035(lib/client/login.ts, 마이페이지 components/me/MyPage)를 쓴다. 기록 남기기 선택은 lib/client/save.ts(`hz:save`)·components/ask/SaveToggle, 목록은 components/MyInquiries(`GET /me/inquiries`). `save: true`는 `savesToHistory`(lib/inquiries/policy.ts)가 로그인 사용자의 실제 질문일 때만 `inquiries.saved`로 남긴다 — 관리자 모드·예시 질문은 브라우저 선택과 상관없이 서버가 거른다.
- 질문 해석(DEC-033·042): `runLiteAnalysis`의 Haiku 1회가 주된 절차 섹션 + 함께 걸린 절차(최대 2)·온/오프라인·새 라벨 제안·검색어를 낸다. 지시문 뒤에 lib/ai/label-bank.ts가 고른 비슷한 라벨 예시(직접 쓴 것만)를 붙인다 — Claude는 미세조정이 안 돼 예시로 분류 체계를 따르게 한다. 새 라벨 제안은 `saveLabelProposal`이 `procedure_labels`에 승인 대기로 저장한다. 공개 질문 라벨링은 `scripts/collect_easylaw_questions.py`(법제처 생활법령 질문만) → `tests/live/label-batch.live.test.ts`(유료, `ALLOW_PAID_API=1 LABEL_BATCH=1`, 허락 필요). 로톡 등 민간 상담 글·실제 사용자 질문은 수집·라벨링에 쓰지 않는다.
- DeepSearch(DEC-038): 홈 질문창의 버튼 → `components/ask/DeepAsk`(양식·직접 입력). 칸 구성·합치기·보내기 전 점검은 lib/inquiries/deep.ts 순수 규칙이고 **점검에 모델을 쓰지 않는다**. 보내는 길은 일반 질문과 같고(`useAsk.send`), analyze 본문 `deep: true`면 근거만 조문 8·판례 4건까지 넓힌다(비용 상한 그대로). 서버는 DEC-041대로 `runDeepAnalysis`(lib/ai/deep.ts: Haiku 구조화 1회 → 쟁점별 법제처 검색 → 고른 단계 답변 1회, 상한 2배 `TIERS[tier].deep`)를 쓰고, 구조 거르기·화면용 사건 구조는 lib/ai/deep-policy.ts 순수 규칙이다. 시각자료(components/result/DeepMapView: 사건 구조도·사실관계 흐름·쟁점별 근거·확인할 사실)는 결과의 `deep`과 검증된 문단으로 코드가 그리며 모델을 더 부르지 않는다.
- 라벨 정확도 평가(DEC-045): 정답을 붙인 질문 묶음(`evals/labels/eval-set.jsonl` 직접 쓴 50문항, `evals/labels/community-gold.jsonl` 커뮤니티 60건의 번호·정답만)을 `tests/live/label-batch.live.test.ts`(유료, `LABEL_IN`·`LABEL_OUT`)로 돌리고 `python -X utf8 scripts/score_label_eval.py <결과> [정답]`(무료)으로 채점한다. 질문 해석 지시문·예시(lib/ai/prompts.ts `UNDERSTAND_SYSTEM`, lib/ai/label-bank.ts)를 바꾸면 `LITE_PROMPT_VERSION`을 올리고 이 채점으로 전후를 비교한다. 틀린 유형은 원문을 옮기지 않고 같은 유형을 새로 써서 예시(`SIDE`·`COMPOSITE`)에 더한다.
- 절차 분류(DEC-037): 질문 해석 라벨(DEC-033)과 규칙(lib/procedure/policy)이 모두 정하지 못해 `other`일 때만 `procedureHintFor`(lib/inquiries/procedure-hint.ts)가 저장된 라벨(`procedure_labels`, lib/procedure/labels-store.ts) → 없으면 Haiku 분류 1회(lib/ai/classify.ts) → 저장 순서로 본다. AI 문구 검사·승인 규칙은 lib/procedure/labels.ts(숫자·한글 수사·단정 표현·법령 언급·개인정보 금지). 라벨은 모두 pending으로 저장되고 `/admin` 승인 뒤에만 다른 질문에 쓰인다 — 방금 분류한 질문에만 AI가 고른 기존 타임라인이 바로 보인다. AI가 정한 안내(`plan.byAi`)에는 화면이 `AI_NOTICE`를 붙인다.
- 비용 상한: 모든 Claude 호출은 `withCostCap`(lib/ai/client.ts)을 거친다. 호출 전 무과금 `countTokens`로 입력을 재고 `planCall`(lib/ai/cost.ts)이 (쓴 비용 + 입력 + max_tokens 출력)이 상한 안일 때만 보낸다. 넘으면 `CostCapReached` — 라이트는 근거를 하나씩 빼고 다시 재고, 못 맞추면 AI 문단 없이 근거만 낸다. 키 점검은 `/api/v1/health`의 `ai.key`(모델 정보 조회, 무과금). **별도 과금 호출(Claude 실호출 테스트·평가)은 사용자의 명시적 허락 없이 하지 않는다** — `pnpm test:live`·`pnpm eval:demo`는 `ALLOW_PAID_API=1` 없이는 Claude 테스트를 건너뛴다.
- 데모 검색: 라우트·lib/ai는 `createLawSource()`(lib/search/law-source.ts)만 쓰고, 한 요청에서 가져온 근거는 `EvidenceSet`(lib/search/evidence.ts)에 모아 인용 검증기에 넘긴다. korean-law-mcp는 `serverExternalPackages`(next.config.ts)로 번들링에서 뺀다.
- 판례·법령 탐색(DEC-029): `createLawSource()`는 `LawSource`(분석·검증)와 `LawExplorer`(결정문·연혁·시점 조문·3단 비교·신구 대조·별표·자치법규·행정규칙)를 함께 돌려준다. 판례 밖 자료 16종(결정문 12 + 조약·학칙·공사공단·공공기관 규정·영문 법령)의 target·필드 이름·상세 항목은 `DECISION_DOMAINS`(explore.ts) 한 표에 있다 — 새 종류는 여기에만 더하고 실호출(`tests/live/explore.live.test.ts`)로 필드 이름을 확인한다. 순수 규칙은 lib/search/explore.ts, 화면은 `/search`(종류 탭·바로 가기)·`/research`(업무용 리서치: 목록 + 옆 미리보기 + 보관함)·`/laws/[name]`·`/decisions/[domain]/[id]`·`/ordinances/[id]`. 모두 LLM 없음 — `SEARCH_NOTICE`, 관련도·심각도·유불리 판정 없음(절대 규칙 2), 결정문은 요지 항목만(DEC-007 원칙), 인증키가 든 `/DRF/` 주소는 응답에 싣지 않는다. 검색어는 주소에 두지 않고 `sessionStorage`(`hz:sq`)로만 화면 사이에 건네며, 조회 이력·보관함(`hz:recent`·`hz:pins`)은 공개 자료의 제목·주소만 localStorage에 둔다. 공개 저장소 lexdiff(BSL 1.1)의 기능 목록만 참고했고 코드는 가져오지 않는다. 헤더는 '판례 아카이브'(DEC-054) 한 버튼으로 검색·리서치를 고르고, 두 화면은 `ArchiveSwitch`로 오가며(주소에는 `from`·`kind`만) 보관함·자료 행·인용 표기는 components/search/rows.ts를 함께 쓴다.
- `cacheComponents: true`(next.config.ts): `usePathname`·`useParams`·`useSearchParams` 같은 클라이언트 훅은 `<Suspense>` 안에서만 쓴다. 밖에서 쓰면 로컬 `pnpm dev`·CI는 통과해도 **Vercel 빌드가 프리렌더에서 실패**한다(예: 헤더 남은 질문 `QuotaRouteSync`).
- CSS Modules(`*.module.css`)는 쓰지 않는다: next.config.ts의 Turbopack 규칙이 모든 `*.css`를 Tailwind 로더에 일반 CSS로 넘겨 클래스 매핑이 사라진다(스타일이 아예 안 붙는다). 컴포넌트 전용 CSS는 접두어를 붙인 전역 CSS로 쓴다(예: components/studio/deck.css의 `hzd-`).
- 서버 코드에서 `process.cwd()`로 경로를 만들어 파일을 읽고 쓰면 빌드가 "Dynamic filesystem access causes tracing of the whole project" 경고를 내고 프로젝트 전체가 배포 서버 번들에 들어간다. 경로는 한 함수에서만 `path.join(/*turbopackIgnore: true*/ process.cwd(), …)`로 만든다(lib/mascot/store.ts `at()`). `pnpm build` 출력의 Warning을 확인한다.
- `next/image`의 `priority`는 Next 16에서 폐기 예정이다. 화면 위쪽 주 그림은 `loading="eager"`(필요하면 `fetchPriority="high"`)를 쓴다.
- 마스코트(lib/mascot, README에 상태 표): 화면은 `HamzziJudge mood=…`로 상태만 넘기고, 그 상태 그림이 없으면 기본 그림을 쓴다. 결과 화면 오류 코드 → 상태는 `moodForError`. 상태 그림은 `pnpm studio`의 `/studio`에서 바꾸고 `public/mascot/moods/`·`lib/mascot/manifest.json`을 커밋해야 배포에 반영된다. 결과 머리 아이콘 얼굴(`manifest.faces`)은 편집기가 바꾸지 않는 별도 파일이다. 캐릭터는 결과를 가리지 않게 작게 둔다(브랜드 가이드 2.4).
- 홈 카테고리(lib/procedure/categories, DEC-028 · 40개를 묶음 탭 7개로 나눠 보임 DEC-034, 2026-11-19 부동산 경매·부동산 등기·과태료·영업신고 추가 DEC-043, 보험금·저작권 추가 DEC-045, 복지·실업급여·세금·부동산 매매 하자·군 복무 3종 추가 DEC-046)는 분류 보조·무료 판례 검색어에만 쓰고 이 기기(sessionStorage)·analyze 본문 `category`로만 오간다(DB 저장 없음). 예시 질문은 `/examples/[id]` 정적 화면으로 바로 보여 주고 질문 생성·횟수 API를 부르지 않는다.
- 절차 타임라인(lib/procedure, DEC-021)은 LLM 없는 규칙 기반이다. 단계 문구에 숫자·단정 표현이 들어가면 `policy.test.ts`가 막는다. 결과(승패)를 판정하지 않는다. 라이트 답변의 질문 해석 호출이 고정 목록(`sections.ts`)에서 섹션 라벨만 고르고(DEC-033, 결과의 `section`), 라벨이 없으면 낱말 규칙으로 정한다 — 단계 문구는 언제나 고정 문안(`steps.ts`·`life-tracks.ts`·`more-tracks.ts`)이다. 그래도 정하지 못한 질문만 DEC-037 저장 라벨·Haiku 분류를 본다.
- 문서 작성(lib/documents, DEC-022·025)은 `legal_documents` 게이트 뒤에 있다(게이트가 꺼져 있으면 관리자 모드 브라우저만 미리보기): API 맨 앞 `requireFeature`, 화면은 게이트가 꺼져 있으면 안내·공식 양식 링크만. 사용자 입력을 칸에 넣기만 하고 저장·로그하지 않는다. AI 생성물이 아니라 `AI_NOTICE` 대신 `DOCUMENT_NOTICE`. 초안 도우미(DEC-023, `POST /documents/{kind}/draft`)는 질문 번호만 받아 마스킹본으로 규칙 칸 + Haiku 사실관계 초안($0.0015)을 주고, 그때는 `AI_NOTICE` + `DRAFT_NOTICE`. 이름·주소·금액은 브라우저 밖으로 보내지 않는다(양식 채우기는 브라우저에서, 저장소·쿠키 없음). 서식 14종(임대차·사기·노동·분쟁조정·집행, 목록은 lib/documents/README.md)은 공식 기관 서식·법령 기준이고(사설 양식 금지, docs/research/05), 화면은 설문 팝업 → 완성 → 예/아니요 → 웹 편집기 → 저장 → 예/아니요, 내보내기 HWPX(한글 표준 구조로 직접 작성)·DOCX(자체 ZIP)·PDF(pdf-lib + public/fonts 나눔고딕)는 모두 브라우저 안에서 만든다. 주민등록번호·생년월일·입금 계좌는 받지 않는다. 새 서식은 `specs/<섹션>.ts` + `fill-<섹션>.ts`에 더한다.
- 햄찌 안내 챗봇(DEC-030, components/guide/GuideBot + lib/guide/topics.ts): 고정 문안 메뉴뿐이고 Claude를 부르지 않으며 자유 입력을 받지 않는다(`GUIDE_NOTICE`). 문안 속 횟수는 브라우저 묶음에 서버 모듈을 끌어오지 않으려고 `GUIDE_LIMITS`에 옮겨 두고, `lib/guide/policy.test.ts`가 원래 상수·개인정보처리방침 문구와 같은지, 허용 숫자·링크·단정/판정 표현을 검사한다. **횟수·기능·정책을 바꾸면 안내 문안도 같이 고친다**(테스트가 상수 불일치는 잡지만 설명 문장의 사실 여부는 못 잡는다). 끄기 설정은 이 기기 localStorage `hz:guidebot`(lib/client/prefs.ts).
- 커뮤니티·씨앗(DEC-047, lib/community README): 게시판 `/community`·`/community/[id]`, API `/api/v1/community/*`·`GET /me/seeds`. 라우트는 lib/community/service.ts만 부르고, 규칙은 policy.ts(순수), DB는 store.ts. 비로그인 글은 비밀번호(scrypt 해시, lib/community/password.ts)로, 로그인 글은 계정으로 수정·삭제한다 — 권한은 `canChange` 한 곳에서 본다. 제목·본문·댓글은 `scanInput` 마스킹본만 저장하고 응답에는 계정 ID·해시를 싣지 않는다(`postView`·`commentView`). AI를 부르지 않으며 `AI_NOTICE` 대신 `COMMUNITY_NOTICE`. 민감정보로 보이는 글은 `sensitiveConsent` 없이는 `409 CONSENT_REQUIRED`, 신고 `REPORT_FOLD_AT`건이면 제목·본문을 가린다(관리자 모드가 되돌림). 씨앗(글 10·댓글 5, 씨앗 1 = 할인 1원)은 로그인 사용자에게만 쌓이고 DB 함수 `award_seeds`·`revoke_seeds`가 하루 상한·중복·회수를 맡는다. **씨앗을 할인에 쓰는 기능은 과금이라 `billing` 게이트 승인 전까지 만들지 않는다**(`SEEDS.redeemEnabled = false`, 절대 규칙 5). 숫자를 바꾸면 화면 문구는 `SEEDS` 상수를 읽으므로 PRD DEC-047만 맞춘다.
- 앱 화면(DEC-049, `mobile/src`): 탭 다섯(법정·판례 법령·절차 서식·광장·내 정보). 서버 호출은 `mobile/src/api.ts` 한 곳(웹과 같은 `/api/v1`, 기기에서는 CapacitorHttp) — 연결 확인이 실패하면 화면은 기기 안 자료(`library.ts`: 예시·조문·판례 목록·예시 글)로 동작하고 그 상태를 화면 위에 표시한다. 앱에 새 온라인 기능을 넣을 때도 서버 규칙(횟수·금액 상한·검증)을 앱에서 다시 만들지 않고, 닿지 않을 때의 화면을 함께 만든다. 분석 호출은 재시도하지 않는다. 브라우저 확인창(`confirm`)을 쓰지 않고 `Sheet`를 쓴다(웹 게시본에서 막힌다). 장식은 `ornament.tsx`(SVG)·`styles.css`. 개발 서버로 온라인 경로를 볼 때는 로컬 서버를 띄우고 `APP_API_PROXY=http://localhost:3100 VITE_API_BASE=/api/v1`(Git Bash는 `MSYS_NO_PATHCONV=1`)로 `vite --config mobile/vite.config.ts`.
- 서류 분석(F-015, DEC-052, lib/casefile·lib/business README): 질문창의 사진 붙이기(components/ask/useAttachments·AttachTray, 브라우저에서 줄여 JPEG로) → `components/casefile/CaseFileFlow`(동의 두 항목 → 읽기 → 확인·수정) → `POST /casefiles/read`(lib/ai/casefile.ts Haiku 비전 1회, 상한 `CASEFILE_READ_COST_CAP_USD`, `tryAiQuota(CASEFILE_WEIGHT)` → `settleAiQuota`) → 확인한 개요를 `useAsk.send(text, true, true)`로 보내 DeepSearch 경로로 분석한다. 판독 결과는 lib/casefile/policy.ts `screenReading`이 거른다(개인 이름 버림·`scanInput`·조문/사건번호·단정 표현 문장 제거). 당사자는 서류에 적힌 역할·자리로만 나누고 판정하지 않는다 — 목록은 `sessionStorage`(`hz:f:<id>`)에만 두고 결과 화면 `PartiesCard`가 보인다. 공개 정보 조회(`POST /businesses/lookup`)는 법인·사업자만, 공식 API만(lib/business/source.ts), 모델 없음·`BUSINESS_NOTICE`. **개인을 찾는 검색·대표자 이름 표시는 만들지 않는다.** 사진이 든 요청의 토큰 추정은 `estimateRequestTokens`(장당 고정값)를 쓴다 — base64를 글자 수로 세지 않는다.
- 소개 메뉴·문의(DEC-051): 헤더 메뉴 아이콘(components/about/AboutMenu) → `/about`·`/about/features`·`/about/roadmap`·`/about/developer`. 문안은 고정 문안 lib/about/content.ts(검사 content.test.ts — 단정·판정 표현, 허용 숫자, 가격·협업 기관 이름 금지)이고 AI를 부르지 않는다. **기능·정책이 바뀌면 기능 가이드 문안도 같이 고친다**(안내 챗봇과 같음). 문의 `POST /contact`는 lib/contact/service.ts: 횟수 제한 → 형식 검사 → `scanInput` → 민감정보면 거절 → 마스킹본만 Resend로 메일, DB 저장 없음. 개발자 이메일은 `developerEmail()`(lib/contact/policy.ts) 한 곳 — 안내 챗봇 `guideEmail`도 이것을 쓴다.
- 사건 진행(F-016, DEC-053, lib/matters README): `/matters`(components/matters, 흑백 톤 — `ui.tsx`의 `Hover`·`Fold`로 자세한 내용을 띄우고 펼친다). 로그인 전용(`requireMatterUser`), 사건 한 건 = `matters.data`(jsonb, 모양은 lib/matters/model.ts `MatterData`, 저장 검증은 policy.ts `MatterDataZ`). **정리 도구라 승패·유불리·책임 항목을 만들지 않는다.** 이름은 저장·표시하되(이 테이블·화면만의 예외) 연락처 꼴은 `maskContacts`로 가리고, 모델로 가는 글은 `maskForModel`(scanInput + 사건의 개인 이름)로 가린다. AI 경로 넷(`/matters/read`·`issues`·`company`·`summarize`)은 모두 lib/matters/ai-gate.ts `runMatterAi`(사용자별 하루 `MATTER_AI_RATE` → 무료 모드·예산 → 호출 → `settleAiQuota`)를 거친다 — 새 AI 경로도 이 함수로. 쟁점 정리는 `runDeepAnalysis` + `verifyDraft`를 그대로 쓰고 검증된 문단만 낸다(lib/ai/matter.ts). 기업 조사(lib/ai/company.ts)는 Claude 웹 검색·웹 가져오기 도구를 쓰고 우리 서버는 웹 페이지를 긁지 않는다 — 출처는 도구가 가져온 주소만 싣는다. 모델은 Opus 5.5, **건당 금액 상한은 없다**(사용자 결정 2026-11-24 — 예산에서 `COMPANY_RESERVE_USD`를 잡고 실제 금액으로 정산, 한 번의 금액은 도구 횟수 `COMPANY_TOOL_LIMITS`가 정하고 웹 검색 건당 `WEB_SEARCH_USD`가 붙는다). 사람 이름 꼴의 이름은 `looksLikeCompanyName`이 거절한다. 구조도(StructureMap)는 사건 자료로 코드가 그린다. 개인에 대한 조사·웹 검색은 만들지 않는다.
- 브라우저 쪽 API 호출과 남은 질문 수는 lib/client/api.ts·components/useQuota.ts 한 저장소로 공유한다(헤더·홈·이어 묻기가 같은 값을 본다).
- server-only 모듈을 직접 import하는 테스트는 `vi.mock("server-only", () => ({}))`를 둔다. 외부 응답은 tests/fixtures에 줄여서 녹화하고, 실명은 가상 이름으로 바꾼다.

## 환경 주의
- Windows: Python 스크립트를 heredoc으로 넘기면 한글이 cp949로 깨진다. 파일로 저장해 `python -X utf8`로 실행한다.
- Docker가 없으면 SQL은 `uv run --no-project --with pglast` 파서로 문법만 확인할 수 있다 (적용 검증 아님).
- hook (.claude/settings.json): 편집 전 `protect.mjs`가 `.env*`(`.env.example` 제외)·`*.pem`·`*.key`·`secrets/` 편집을 막고, 편집 후 `format.mjs`가 ts·js·css·json에 prettier, ts·js에 `eslint --fix`, collector의 py에 `ruff format`을 자동 실행한다. 손으로 포맷을 맞출 필요는 없고, 편집 뒤 포맷 변경이 diff에 섞일 수 있다.
- 여러 Claude 세션(데스크톱 앱·VS Code)이 이 폴더(main 체크아웃)에서 동시에 고치고 커밋한다. 여기서 `git add -A`·커밋을 하면 다른 세션의 작업 중 파일이 섞여 배포가 깨진 적이 있다(2026-11-18). 변경은 `git worktree add ../<이름> origin/main`으로 만든 별도 폴더에서 하고 `git push origin HEAD:main`으로 올린다. Windows에서 worktree 폴더는 경로가 길어 `git worktree remove`가 실패하므로 `cmd /c 'rmdir /s /q "\\?\<절대경로>"'` 뒤 `git worktree prune`으로 지운다.
- `pnpm exec prettier --write lib`처럼 폴더째 포맷하면 관련 없는 파일이 바뀐다. 고친 파일만 지정한다.
- `.env*`는 settings.json이 읽기도 막는다. 키가 필요한 스크립트는 실행 시 `.env.local`을 읽게 한다 (예: scripts/korean-law-mcp.mjs).
- korean-law-mcp는 두 가지로 쓴다 (DEC-009). ① `.mcp.json`의 MCP 서버는 Claude Code 개발 보조용(키는 `.env.local`의 `LAW_OC`, 없으면 `OPEN_LAW_API_KEY`). ② 서비스 코드는 MCP 프로토콜이 아니라 라이브러리 함수(`korean-law-mcp/lib/*`, `korean-law-mcp/tools/*`)를 서버에서 직접 import하고, 한 어댑터 모듈을 거쳐서만 호출한다. 실시간 조회한 판례 본문은 저장하지 않는다 (DEC-007).

## 스킬·리뷰어
- `add-crawler` 데이터 소스 추가 · `add-endpoint` API 추가 · `add-migration` DB 변경 · `figma-sync` Figma 디자인을 코드에 반영
- PR 전에 `legal-reviewer` 에이전트로 절대 규칙 위반을 검사한다.

## 작업 방식
- 큰 기능은 계획을 먼저 보여주고 승인 후 구현한다.
- 테스트 이름·커밋 메시지에 F-ID를 넣는다 (예: `F-003 AC2 결과 없음 안내`).
- PRD에 없는 결정이 필요하면 임의로 정하지 말고 PRD 16.1 오픈 이슈에 추가를 제안한다. 새 결정 번호는 PRD 16장 표의 마지막 DEC 다음 번호를 쓴다(다른 세션이 먼저 쓸 수 있으니 올리기 직전에 `origin/main`에서 다시 확인).
- 법령·판례 근거의 데이터 소스는 공식 API만 쓴다. 판결서 인터넷 열람은 수집하지 않고 링크만 제공한다.
- **라벨링·평가용 질문 수집 (사용자 결정 2026-11-19, DEC-044)**: 수집을 허용한 공개 커뮤니티(robots.txt가 그 게시판 수집을 막지 않는 곳)의 법률 사연은 내부 평가·라벨 강화 목적으로 모을 수 있다. 조건: ① 로톡처럼 AI 수집 봇을 차단하거나 수집을 막은 곳은 제외 ② **원문은 공개 저장소에 올리지 않는다** — `evals/labels/community/`(gitignore, 이 PC에만)에 두고, 저장소에는 라벨·통계와 직접 다시 쓴 문장만 올린다 ③ 작성자 ID·닉네임·글 주소는 저장하지 않는다 ④ 모델에 보내기 전에 `scanInput`으로 개인정보를 가린다 ⑤ 한 번에 한 쪽씩 간격을 두고 조금만 가져온다 ⑥ 답변 근거(법령·판례)로는 쓰지 않는다. 스크립트: `scripts/collect_community_questions.py`.
- **실제 법률 사례로 테스트·평가 (사용자 결정 2026-11-19, DEC-044)**: 공익 목적의 무료 프로젝트이므로 실제 사례로 테스트할 수 있다. 쓸 수 있는 사례: ① 사용자 본인의 사례 ② 당사자가 써 달라고 했거나 동의한 사례(사용자가 그렇다고 알려 주면 따로 증빙을 요구하지 않는다) ③ 위 조건으로 모은 공개 커뮤니티 사연 ④ 공개된 판례·법제처 자료. 지킬 것: 모델에 보내기 전 `scanInput`으로 이름·연락처·주소·계좌를 가린다(절대 규칙 4) · 원문은 공개 저장소·로그·보고서에 올리지 않고 이 PC(`evals/labels/community/`)에만 둔다 · 저장소에 남길 때는 직접 다시 쓴 문장과 가상 이름을 쓴다 · 다 쓴 원문은 당사자가 원하면 바로 지운다. 유료 호출이면 절대 규칙 8대로 금액만 먼저 확인한다 — 이것은 비용 확인이지 사례 사용 금지가 아니다. 서비스가 받은 **다른 사용자**의 질문(DB의 `inquiries`)은 그 사용자의 동의 없이 평가·라벨링에 쓰지 않는다.

## 금지
- `.env`, 비밀키, 실제 사용자 데이터 편집·출력 (당사자가 동의한 사례를 위 조건으로 테스트·평가에 쓰는 것은 가능)
- robots.txt·이용약관이 금지한 소스 크롤링 코드 (수집을 허용한 공개 커뮤니티는 위 작업 방식의 DEC-044 조건으로 가능)
- 플랫폼이 변호사를 자동 배정하거나 수임 성사에 연동해 과금하는 코드 (DEC-001)
