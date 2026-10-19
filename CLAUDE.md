# 햄찌법원 (Hamzzi Court)

자연어로 설명한 법률 문제를 구조화하고 실제 법령·판례를 근거로 보여주는 AI 법률 정보 탐색 서비스. Phase 2에서 동의 기반 비식별 사건 게시로 변호사 상담 제안을 받는다.

## 제품 요구사항
- PRD: `docs/PRD.md` — 구현 전에 해당 **F-ID 절만** 읽는다. 전체를 읽지 않는다.
- 현재 단계: **Phase 1** (F-001~F-007, F-013). Phase 2 기능은 지시가 있을 때만 작업한다.
- 절대 규칙 (PRD 3·8·10장 요약):
  1. DB에 없는 판례·조문·사건번호는 출력하지 않는다. 렌더링 전에 검색 결과와 대조한다 (F-005).
  2. 승소·처벌·해결 가능성을 확정 표현하지 않는다. "반드시", "무조건", "100%" 금지 (N1).
  3. 기간·비용 숫자는 계산 함수나 공식 기준 결과만 쓴다. LLM이 숫자를 만들지 않는다.
  4. 개인정보는 프롬프트·로그·에러 메시지에 남기지 않는다 (F-007). 입력 원문은 DB에 저장하지 않고 마스킹본만 저장한다 (DEC-006).
  5. `[게이트]` 기능(F-010~F-012), 모든 과금, 법률문서 생성은 F-013 승인 전 비활성 상태로만 구현한다.
  6. 모든 AI 결과에 "AI 생성 · 법률 자문 아님"을 표시한다.
  7. 비로그인은 질문 1회만 허용하고, 그 이후 요청은 서버에서 `LOGIN_REQUIRED`로 막는다 (DEC-005).

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
| 목적 | 명령 |
|---|---|
| 개발 서버 | `pnpm dev` |
| 단위 테스트 | `pnpm test` |
| E2E 테스트 | `pnpm test:e2e` (처음 한 번 `pnpm exec playwright install chromium`) |
| 린트 / 타입 | `pnpm lint` / `pnpm typecheck` |
| 문서 교차 검증 | `pnpm docs:check` (docs 수정 후 항상) |
| 수집기 테스트 | `pnpm collector:test` |
| DB 마이그레이션 | `pnpm exec supabase migration new <이름>` (add-migration 스킬) |

## 폴더
`app/` 화면·`app/api/v1/` API · `lib/{gate,pii,ai,search,citations,calc,supabase}` 컴포넌트(각 README에 책임) · `collector/` Python 수집기 · `supabase/` DB · `tests/{unit,e2e}` · `evals/` AI 평가셋

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
