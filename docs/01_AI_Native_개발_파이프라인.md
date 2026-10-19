# 01. AI Native 개발 파이프라인 (Claude Code 기반 Legal Tech)

> 서비스명: **햄찌법원 (Hamzzi Court)** — 마스코트 '햄찌 판사'(골든 햄스터)를 앞세운 법률 정보 아카이브 & AI 길잡이. 브랜드 규칙은 `05_브랜드_가이드.md` 참고.

## 0. 핵심 원칙 — "AI가 코드를 쓰고, 사람은 의도·검증·책임을 쓴다"

| 원칙 | 의미 | Claude Code에서의 실천 |
|---|---|---|
| **문서가 곧 프롬프트** | PRD·설계·규칙을 리포지토리에 두면 매 세션마다 AI가 읽는다 | `docs/PRD.md`, `CLAUDE.md`, `.claude/skills/` |
| **작게 쪼개고 검증 가능하게** | 한 번에 기능 하나, 끝 조건(Done)이 테스트로 정의됨 | 기능별 Plan Mode → 구현 → 테스트 → 커밋 |
| **근거 없는 출력 금지** | 법률 도메인은 환각(hallucination) = 법적 리스크 | 모든 AI 답변은 판결문/법령 출처 인용 필수, 평가셋으로 회귀 테스트 |
| **결정적 계산은 코드로** | 인지대·송달료·기간 계산은 LLM이 아니라 함수가 | AI는 "어떤 함수를 부를지"만 결정(tool use) |
| **사람이 최종 승인** | 배포·DB 마이그레이션·법적 고지문은 사람 리뷰 | hooks + PR 리뷰 + `/code-review` |

---

## 1. 전체 파이프라인 한눈에 보기

```
[Phase 0] 기획/리서치 ─▶ [Phase 1] PRD·설계 문서 ─▶ [Phase 2] 리포 세팅(CLAUDE.md·Skills·Hooks)
        │                                                        │
        ▼                                                        ▼
[Phase 3] 데이터 파이프라인(수집·정제·비식별·색인) ─▶ [Phase 4] 검색/RAG + AI 상담 엔진
        │                                                        │
        ▼                                                        ▼
[Phase 5] 프론트엔드(UI/UX) ─▶ [Phase 6] 마켓/결제/소장 작성 ─▶ [Phase 7] 평가·보안·법무 검토
                                                                 │
                                                                 ▼
                                              [Phase 8] 배포·모니터링·반복 개선(Loop)
```

각 Phase는 **"Plan Mode로 계획 → 승인 → 구현 → 테스트 → 리뷰 → 커밋"** 사이클을 반복합니다.

---

## 2. Phase별 방향성 · 지시사항 · 프롬프트

> 아래 프롬프트는 Claude Code 채팅창에 그대로 붙여 넣어 쓰도록 작성했습니다. `< >` 부분만 바꾸세요.

### Phase 0. 기획 · 리서치

**방향성**: 코드를 쓰기 전에 "합법적으로 무엇을 수집·제공·과금할 수 있는가"를 먼저 확정. Legal tech는 기술보다 **규제가 범위를 정합니다.**

**지시해야 할 것**
- 데이터 소스별 이용약관/라이선스/API 조건 조사 (국가법령정보센터 Open API, 대법원 판결서 열람, 공공데이터포털, AI Hub 법률 데이터 등)
- 경쟁 서비스 기능 비교 (로톡, 엘박스, 케이스노트, 빅케이스, 대법원 나홀로소송, LexDiff 등)
- 변호사법(제34조·제109조 등) 관련 리스크 정리 → 반드시 **변호사 자문으로 최종 확인**

**프롬프트**
```
너는 한국 리걸테크 리서치 어시스턴트야. 아래 서비스 아이디어에 대해 조사해줘.
<아이디어 요약 붙여넣기>

1) 판결문·법령 데이터를 합법적으로 수집할 수 있는 공식 소스 목록과 각 소스의
   이용 조건(API 여부, 크롤링 허용 여부, 재배포 가능 여부, 비용)을 표로 정리
2) 국내 경쟁 서비스 5개 이상의 핵심 기능/가격/수익모델 비교표
3) 변호사법·개인정보보호법·AI 기본법 관점에서 이 서비스가 부딪힐 수 있는 쟁점 목록
   (확실한 것과 추정인 것을 구분하고, 출처 URL을 달 것)
결과는 docs/research/ 아래 마크다운으로 저장해.
```

### Phase 1. PRD · 설계 문서

**방향성**: PRD는 사람용 문서이자 **AI용 명세서**. "모호한 형용사(쉽게, 빠르게)" 대신 측정 가능한 조건으로.

**지시해야 할 것**
- PRD(`docs/PRD.md`) → 기술 설계(`docs/ARCHITECTURE.md`) → 데이터 모델(`docs/DATA_MODEL.md`) → API 명세(`docs/API.md`) 순으로 분리
- 각 기능에 **수용 기준(Acceptance Criteria)** 을 Given/When/Then으로

**프롬프트**
```
docs/PRD.md를 읽고 기술 설계 문서를 작성해줘. 코드는 아직 쓰지 마.
- docs/ARCHITECTURE.md: 시스템 구성도(mermaid), 컴포넌트 책임, 외부 연동, 배포 구조
- docs/DATA_MODEL.md: 테이블/컬렉션, 필드, 인덱스, 개인정보 컬럼 표시(PII 태그)
- docs/API.md: 엔드포인트, 요청/응답 스키마, 인증, 에러 코드
PRD에 없는 결정이 필요하면 임의로 정하지 말고 "OPEN QUESTION"으로 문서 하단에 모아줘.
```

### Phase 2. 리포지토리 세팅 (AI Native의 핵심)

**방향성**: Claude Code가 매번 같은 규칙으로 일하도록 "작업 환경" 자체를 코드화.

**만들어야 할 것**

| 파일 | 역할 |
|---|---|
| `CLAUDE.md` | 프로젝트 개요, 스택, 명령어(`pnpm test` 등), 코딩 규칙, **절대 금지 사항** |
| `.claude/skills/<name>/SKILL.md` | 반복 작업 레시피 (예: 크롤러 추가, 판례 파서 추가, 새 사건유형 상담 스킬 추가) |
| `.claude/agents/*.md` | 서브에이전트 (예: `legal-reviewer`: 법률 고지·출처 누락 검사, `security-reviewer`) |
| `.claude/settings.json` hooks | 편집 후 자동 lint/format, 커밋 전 테스트, `.env`·개인정보 파일 편집 차단 |
| MCP 서버 | Playwright(크롤링·E2E), DB(Supabase/Postgres), GitHub |

**CLAUDE.md 예시 골격**
```markdown
# 햄찌법원 — 법률 정보 아카이브 & AI 상담
## 스택
Next.js 15(App Router) · TypeScript · Tailwind · Supabase(Postgres+pgvector) · Python 크롤러
## 명령어
- 개발: pnpm dev / 테스트: pnpm test / 크롤러: uv run crawler <source>
## 규칙
- AI 답변 생성 코드는 반드시 출처(case_id, 조문 id)를 함께 반환한다. 출처 없는 문장은 UI에서 "참고" 라벨.
- 비용/기간 계산은 lib/calc/* 순수 함수로만. LLM이 숫자를 직접 생성하게 하지 않는다.
- 판결문 원문 저장 전 반드시 pii/deidentify 파이프라인을 통과시킨다.
- robots.txt·이용약관에서 금지한 소스는 크롤링 코드 작성 금지.
## 금지
- .env, secrets/, data/raw_pii/ 편집 금지
- "승소 가능성 %"처럼 결과를 단정하는 문구 생성 금지
```

**프롬프트**
```
/init 결과를 바탕으로 CLAUDE.md를 위 골격에 맞게 다듬어줘.
그리고 다음을 만들어줘:
1) .claude/skills/add-crawler/SKILL.md — 새 데이터 소스 크롤러 추가 절차
   (robots/약관 확인 체크리스트 → 수집기 → 파서 → 비식별 → 저장 → 테스트)
2) .claude/agents/legal-reviewer.md — PR의 AI 응답/고지문에서 단정적 법률 판단,
   출처 누락, 변호사법 리스크 문구를 찾아 보고하는 리뷰어
3) .claude/settings.json — Edit/Write 후 prettier+eslint, .env 및 data/raw_pii 편집 차단 hook
```

### Phase 3. 데이터 파이프라인 (수집 → 정제 → 비식별 → 색인)

**방향성**: 아카이브가 "공익적으로 완결된 1차 제품"이므로 **가장 먼저, 가장 탄탄하게.** 공식 API 우선, 크롤링은 허용된 범위에서만.

**지시해야 할 것**
- 소스별 Adapter 패턴 (`sources/law_go_kr.py`, `sources/scourt.py` …)
- 원문 → 구조화(사건번호, 법원, 선고일, 사건종류, 주문, 이유, 참조조문, 참조판례)
- 비식별(이름·주소·주민번호·전화 등) 재검사, 중복 제거, 버전 관리
- 청킹(판결 "이유" 섹션 단위) → 임베딩 → 벡터 + 키워드(형태소) 색인
- 스케줄러(일 단위 증분 수집), 실패 재시도, 수집 로그

**프롬프트**
```
docs/DATA_MODEL.md의 cases 스키마를 기준으로 국가법령정보센터 Open API 판례 수집기를 만들어줘.
- 위치: crawler/sources/law_open_api.py (Python, httpx, pydantic)
- 증분 수집(마지막 수집일 이후), 429/5xx 지수 백오프, 요청 간 딜레이 설정값화
- 응답 XML/JSON → Case 모델 파싱, 파싱 실패 건은 dead_letter 테이블로
- 저장 전 pii.deidentify() 통과 필수
- pytest로 샘플 응답 fixture 3개 기반 단위 테스트 작성
먼저 Plan을 보여주고 내가 승인하면 구현해.
```

### Phase 4. 검색 · RAG · AI 상담 엔진

**방향성**: "AI가 답한다"가 아니라 **"AI가 찾아서 근거와 함께 정리한다."**
- 하이브리드 검색(키워드 BM25 + 벡터) → 재정렬(rerank) → LLM 요약
- 상담은 **사건 유형별 Skill(인테이크 양식)** 로 구조화: 임금체불, 전세보증금, 손해배상, 이혼, 형사(고소) 등
- 기간/비용은 tool use로 계산 함수 호출, 절차 타임라인은 사건 유형별 템플릿 + 사용자 상황 분기

**AI 아키텍처 권장 형태**
```
사용자 질문
  └▶ [분류] 사건 유형 판별 (가벼운 모델, 예: claude-haiku-5-5)
       └▶ [인테이크 Skill] 부족한 필수 정보 질문 (structured output: JSON 스키마)
            └▶ [검색 tool] search_cases(query, filters) / get_statute(id)
                 └▶ [계산 tool] calc_court_fee(), estimate_duration(), procedure_timeline()
                      └▶ [작성] 근거 인용 포함 요약 (claude-opus-5-5, Citations 기능)
                           └▶ [가드레일] 단정 표현/출처 누락 검사 → UI 렌더
```

**프롬프트**
```
lib/ai/ 아래에 상담 오케스트레이터를 만들어줘. Anthropic TypeScript SDK 사용.
- 모델: 메인 claude-opus-5-5, 분류/추출 등 보조 작업은 claude-haiku-5-5
- tools: search_cases, get_statute, calc_court_fee, estimate_duration, build_timeline
  (계산 tool은 lib/calc/ 순수 함수 호출, 숫자는 절대 LLM이 만들지 않음)
- 사건 유형별 인테이크 양식은 skills/intake/<type>.json 스키마로 정의하고
  구조화 출력으로 검증
- 응답에는 반드시 citations(case_id, 문단 위치)를 포함
- 스트리밍 응답 + 프롬프트 캐싱(시스템 프롬프트/도구 정의 고정)
- 평가: evals/consult/*.yaml 20건으로 "출처 포함률, 단정표현 0건" 자동 채점 스크립트
```

### Phase 5. 프론트엔드 (UI/UX)

**방향성**: LexDiff처럼 **첫 화면 = 큰 검색(질문)창 하나.** 4–50대도 3초 안에 "여기에 물어보면 된다"를 이해해야 함.

**지시해야 할 것**
- 디자인 토큰(색·타이포·간격)을 먼저 정의하고 컴포넌트는 shadcn/ui 기반
- 핵심 화면: 홈(질문창) → 결과(판례 카드 · 기간/비용 · 절차 타임라인) → 분기(변호사 연결 / 혼자 진행)
- 접근성: 본문 16px 이상, 대비 4.5:1, 키보드 조작, 모바일 우선
- 모든 AI 결과 하단에 법적 고지

**프롬프트**
```
docs/design/에 있는 선택된 시안(<시안 이름>)을 기준으로 Next.js 페이지를 구현해줘.
- app/page.tsx: 중앙 질문창(돋보기 버튼 클릭/Enter → /consult?q=로 이동)
- app/consult/page.tsx: 스트리밍 응답, 판례 카드 3개, 기간·비용 카드, 절차 타임라인(가로 직선)
- 디자인 토큰은 tailwind.config의 theme.extend로, 하드코딩 색상 금지
- Playwright로 홈→질문→결과 렌더 E2E 테스트 1개
```

### Phase 6. 마켓플레이스 · 결제 · 소장 작성

**방향성**: 수익 기능은 **법적 구조 확정 후** 구현. (중개수수료 vs 광고/구독 모델 결정 — `04_추가_결정사항.md` 참고)

**지시해야 할 것**
- 변호사 프로필(자격 검증: 대한변협 등록번호 확인 절차), 리뷰/평점, 가격표(전화/서면/방문/착수금)
- 결제(토스페이먼츠/포트원), 정산, 환불 정책, 영수증
- 소장 자동 작성: 사건 유형별 템플릿 + 인테이크 데이터 매핑 → DOCX/PDF 출력, 첨부 증거 체크리스트
- "AI 첨삭"은 표현·누락 체크 중심으로 범위를 명확히(법률 판단 대행으로 보이지 않도록 — 법무 검토 필요)

**프롬프트**
```
민사 소액사건(대여금 반환) 소장 자동 작성 기능을 만들어줘.
- templates/complaint/loan_small_claim.docx (docxtemplater 변수)
- 인테이크 JSON → 템플릿 변수 매핑 함수 + 누락 필드 목록 반환
- 인지대/송달료는 lib/calc/court_fee.ts로 계산해서 표시
- 생성 문서 상단 워터마크: "AI 작성 초안 — 제출 전 검토 필요"
- 단위 테스트: 필수값 누락 시 생성 거부, 금액 콤마/한글 금액 변환
```

### Phase 7. 평가 · 보안 · 법무 검토

**지시해야 할 것**
- **AI 평가셋(evals)**: 사건 유형별 질문 50~100개 + 기대 판례/절차. 모델·프롬프트 변경 시마다 회귀 실행
- 보안: 상담 내용 암호화 저장, 접근 로그, RLS(Row Level Security), 민감정보 최소 수집
- `/code-review`, `/security-review` 정기 실행, `legal-reviewer` 서브에이전트로 고지문 검사

**프롬프트**
```
/security-review
그 다음 legal-reviewer 에이전트로 app/consult와 lib/ai 전체를 검토해서
1) 단정적 법률 판단 문구 2) 출처 없는 수치 3) 개인정보 로그 출력
을 파일:라인 형식으로 보고해줘.
```

### Phase 8. 배포 · 모니터링 · 반복

- Vercel(웹) + Supabase(DB) + 크롤러는 별도 워커(Railway/Fly.io/GitHub Actions cron)
- 관측: Sentry(에러), PostHog(퍼널: 질문→결과→분기 클릭), LLM 비용/지연 대시보드
- 사용자 피드백("이 판례가 도움이 됐나요?")을 평가셋에 다시 편입 → **데이터 플라이휠**

---

## 3. Claude Code 사용 팁 (이 프로젝트에 특화)

| 상황 | 방법 |
|---|---|
| 큰 기능 시작 | Plan Mode(Shift+Tab)로 계획만 받고 승인 후 구현 |
| 병렬 작업 | 크롤러·프론트·AI엔진을 각각 다른 세션/워크트리에서 (서로 다른 파일만 수정) |
| 반복 작업 | 3번 이상 반복하면 Skill로 만들기 (`add-crawler`, `add-intake-type`, `add-complaint-template`) |
| 컨텍스트 관리 | 기능 하나 끝나면 새 세션. 긴 결정사항은 `docs/DECISIONS.md`에 기록해 다음 세션이 읽게 |
| 품질 게이트 | hooks로 lint/test 자동, PR 전 `/code-review` |
| 지시 원칙 | "무엇을/어디에/끝 조건/금지사항" 4요소를 항상 포함 |

**좋은 지시 vs 나쁜 지시**
- ❌ "판례 검색 기능 만들어줘"
- ✅ "lib/search/hybrid.ts에 BM25(Postgres FTS)+pgvector 하이브리드 검색을 만들어. 입력 query, filters(court, date, caseType). 상위 50개를 RRF로 합치고 상위 10개 반환. tests/search.test.ts에 fixture 20건으로 정답 판례가 top3에 드는지 테스트. 외부 검색엔진 도입은 하지 마."

---

## 4. 기술 스택 & 필요 지식

### 4-1. 추천 스택 (1인~소규모 팀, 빠른 MVP 기준)

| 영역 | 추천 | 대안 | 비고 |
|---|---|---|---|
| 프론트엔드 | **Next.js (App Router) + TypeScript** | Remix, SvelteKit | SEO(판례 페이지 검색 유입)에 SSR 유리 |
| 스타일/UI | **Tailwind CSS + shadcn/ui** | Chakra | 디자인 토큰 관리 용이 |
| 백엔드/API | Next.js Route Handlers + **Python FastAPI**(AI/검색) | NestJS | 크롤링·NLP는 Python 생태계가 강함 |
| DB | **PostgreSQL (Supabase)** | Neon, RDS | Auth·Storage·RLS 포함 |
| 벡터 검색 | **pgvector** | Qdrant, Pinecone | 초기엔 DB 하나로 단순하게 |
| 키워드 검색 | Postgres FTS → 규모 커지면 **OpenSearch + nori(한국어 형태소)** | Elasticsearch, Meilisearch | 판례는 키워드(사건번호·조문) 검색이 매우 중요 |
| 크롤링 | **httpx + Playwright** (Python), 스케줄: GitHub Actions/cron | Scrapy | 공식 API 우선 |
| LLM | **Claude API** — 메인 `claude-opus-5-5`, 경량 `claude-haiku-5-5` | — | tool use, structured output, Citations, prompt caching |
| 임베딩 | 다국어 임베딩 모델(한국어 성능 비교 후 선택) | — | 판례 도메인으로 검색 품질 평가 필수 |
| 문서 생성 | docxtemplater / python-docx, PDF 변환 | — | 소장 출력 |
| 결제 | 토스페이먼츠 / 포트원 | — | 에스크로·정산 고려 |
| 인증 | Supabase Auth (카카오/네이버 소셜) | NextAuth | 4–50대 접근성 → 카카오 로그인 필수급 |
| 배포 | Vercel + Supabase + 워커(Fly.io/Railway) | AWS | |
| 관측 | Sentry, PostHog | Datadog | |

### 4-2. 필요 지식 체크리스트

**개발**
- TypeScript/React/Next.js(서버 컴포넌트, 스트리밍), Python(비동기 HTTP, pydantic)
- SQL·인덱스·RLS, 벡터 검색 기초(임베딩, 코사인 유사도, HNSW)
- 검색 품질: BM25, 하이브리드 검색, RRF, reranking, 평가지표(Recall@k, nDCG)
- RAG 설계: 청킹 전략, 메타데이터 필터, 인용(citation), 환각 억제
- LLM API: tool use, structured output(JSON 스키마), 스트리밍, 프롬프트 캐싱, 비용 관리
- 크롤링 윤리/기술: robots.txt, rate limit, 변경 감지, HTML/XML 파싱
- 결제/정산, 웹 보안(OWASP Top 10), 개인정보 암호화

**AI Native 도구**
- Claude Code: CLAUDE.md, Plan Mode, Skills, Subagents, Hooks, MCP, 워크트리 병렬 작업
- 프롬프트 엔지니어링: 역할·맥락·제약·출력형식·예시, 평가 주도 개선(eval → 수정 → 재평가)

**도메인 (Legal)**
- 민사/형사/가사/행정 소송의 기본 절차와 기간 (내용증명 → 지급명령/조정 → 소송 → 판결 → 강제집행)
- 소액사건심판(3천만 원 이하), 지급명령, 전자소송, 나홀로소송 제도
- 인지대·송달료 산정 기준(민사소송 등 인지법 등)
- 판결문 구조(사건번호 체계 예: `2023가단12345`, 주문/이유/참조조문)
- 규제: 변호사법(비변호사 법률사무 취급·알선 대가 금지 쟁점), 개인정보보호법(민감정보), 저작권법(판결은 보호받지 못하는 저작물이지만 DB·사이트 약관은 별개), AI 기본법(생성형 AI 고지 의무 등), 전자상거래법

> ⚠️ 위 법률 내용은 개발 방향 설정을 위한 일반 정보이며 법률 자문이 아닙니다. 서비스 구조(특히 수수료 모델·AI 첨삭 유료화)는 출시 전 변호사 검토가 필수입니다.
