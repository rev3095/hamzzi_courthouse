# 햄찌법원 기술 설계 (ARCHITECTURE)

> 기준: `docs/PRD.md` v1.3 · 버전 v0.3 (2026-10-19) · 데이터: `docs/DATA_MODEL.md` · API: `docs/API.md`
> 스택 확정(DEC-004): Next.js + Supabase(Postgres·pgvector·Auth) + Python 수집기
> 데모(DEC-009~013): 검색·인용 재검증은 수집 DB 대신 korean-law-mcp 라이브러리로 법제처를 실시간 조회한다. 흐름은 4.2절.
> 표기: **(제안)** = PRD에 없는 설계 판단, 하단 OPEN QUESTION에서 확정 필요 · `[게이트]` = F-013 승인 전 비활성

## 1. 설계 원칙 (PRD에서 도출)
| 원칙 | 근거 | 설계 반영 |
|---|---|---|
| 근거 없는 인용 금지 | N2, F-005 | LLM 응답을 그대로 내보내지 않고 **인용 검증기**를 거친 뒤 렌더링 |
| 숫자는 계산으로 | CLAUDE.md 규칙 3, F-014 | 기간·비용은 `calc` 모듈(순수 함수)만 생성 |
| PII 최소화 | F-007, 9.2 | 입력 직후 **PII 필터** → LLM에는 마스킹본만 전달 |
| 원본/공개본 분리 | 9.2, F-011 | 사건 원본·공개 개요·변호사 제공본을 별도 테이블·권한으로 분리 |
| 미승인 기능 차단 | F-013 | 모든 `[게이트]` 경로가 서버에서 **게이트 검사** 후 실행 |

## 2. 시스템 구성도
```mermaid
flowchart LR
  subgraph Client
    U[사용자 브라우저]
    L[변호사 브라우저 · Phase 2]
  end
  subgraph App["웹 앱 · Next.js"]
    UI[UI · 서버 컴포넌트]
    API[API 라우트 /api/v1]
    GATE[기능 게이트 F-013]
    PII[PII 필터 F-007]
    ORCH[AI 오케스트레이터 F-002·F-008]
    SRCH[검색 서비스 F-003·F-004]
    VER[인용 검증기 F-005]
    CALC[계산 모듈 F-014]
  end
  subgraph Data["Supabase · Postgres + pgvector"]
    DB[(법령·판례 DB)]
    UDB[(사용자·사건 데이터 · RLS)]
    AUD[(감사 로그)]
    AUTH[인증]
  end
  subgraph Batch["수집기 · Python"]
    COL[법령·판례 수집·정제·임베딩]
  end
  LAW[[법제처 판례/법령 API]]
  KLM[[korean-law-mcp 라이브러리 · 데모]]
  LLM[[Claude API]]
  EMB[[임베딩 모델 · 미정]]

  U --> UI --> API
  L --> UI
  API --> GATE
  API --> PII --> ORCH
  ORCH <--> LLM
  ORCH --> SRCH --> DB
  ORCH --> VER --> DB
  ORCH --> CALC
  API --> UDB
  API --> AUD
  API --> AUTH
  COL --> LAW
  COL --> EMB
  COL --> DB
  SRCH --> EMB
  SRCH -. 데모 .-> KLM
  VER -. 데모 .-> KLM
  KLM --> LAW
```

## 3. 컴포넌트 책임
| 컴포넌트 | 책임 | F-ID | 하지 않는 일 |
|---|---|---|---|
| UI | 검색창 1개 홈, 결과(8.3 구조), 요약 확인·수정, 동의 화면, 변호사 게시판 | 전체 | 서버 검증 없이 결과 표시 |
| API 라우트 | 인증·권한·입력 검증(빈 입력 차단 F-001 AC2)·**비로그인 3회 제한**(익명 세션 쿠키 + IP 해시, 이어 묻기 포함, F-001 AC3, DEC-010)·레이트 리밋, 에러 표준화 | F-001, 전체 | 비즈니스 로직을 UI에 노출 |
| 기능 게이트 | `feature_gates` 상태 조회, `Approved` 아니면 `FEATURE_GATED` 반환, 운영자 변경 감사 기록 | F-013 | 클라이언트 플래그만으로 판단 |
| PII 필터 | 이름·전화·주민번호·계좌·주소 패턴 탐지 → 경고·마스킹, 민감정보 동의 확인. 원문은 요청 메모리 안에서만 처리하고 버림 | F-007 | 원문을 DB·로그·프롬프트에 저장 (DEC-006) |
| AI 오케스트레이터 | 구조화(사실/추론/확인 필요), 추가 질문 ≤3, 검색 질의 생성, 근거 기반 요약, Phase 2 에이전트 대화·요약서 | F-002, F-006, F-008 | 숫자 생성, DB 밖 인용, 결과 단정 |
| 검색 서비스 | 하이브리드 검색(키워드 + 벡터) → 재정렬 → 유사도 임계값 판단. 데모는 korean-law-mcp 어댑터로 법령 조문·판례를 실시간 조회 (DEC-009) | F-003, F-004, F-006 | 판례 원문 외부 재수집 |
| 인용 검증기 | 응답 속 사건번호·조문을 DB와 대조 → 불일치 제거/“미확인” 표시, 실패율 기록. 데모는 출처·원문 구절 대조 + `verify_citations` 재조회 (F-005 AC2) | F-005 | 검증 실패 항목 통과 |
| 계산 모듈 | 절차 단계·기간·비용(인지대 등) 계산, 출처 첨부 | F-014 | LLM 호출 |
| 수집기 | 공식 API 증분 수집, 파싱, 비식별 재검사, 청킹·임베딩, 버전·시행일 관리, 실패 기록 | 9.1, 9.3 | 판결서 인터넷 열람 수집 |
| 감사 로그 | 원본 접근, 동의, 게이트 변경, 변호사 열람 기록 | 9.2, F-012 | 사건 원문 저장 |

## 4. 핵심 흐름
### 4.1 Phase 1 분석 요청
```mermaid
sequenceDiagram
  participant U as 사용자
  participant A as API
  participant P as PII 필터
  participant O as 오케스트레이터
  participant S as 검색
  participant V as 인용 검증기
  U->>A: POST /inquiries {text}
  A->>P: 탐지·마스킹
  P-->>U: 경고(있으면) + 마스킹본 확인
  U->>A: POST /inquiries/{id}/analyze
  A->>O: 마스킹본
  O->>O: 구조화 · 추가 질문 필요 판단
  alt 정보 부족
    O-->>U: 추가 질문(≤3)
  else 충분
    O->>S: 검색 질의
    S-->>O: 판례·법령 후보 + 유사도
    alt 유사도 < 임계값
      O-->>U: "범위 내 미확인" + AI 추천(판례 근거 아님) 라벨
    else
      O->>O: 근거 기반 요약
      O->>V: 응답 내 인용
      V-->>O: 검증 결과(불일치 제거)
      O-->>U: 8.3 구조 결과 + "AI 생성 · 법률 자문 아님"
    end
  end
```

### 4.2 데모 분석 요청 (DEC-009~013)
입력·개인정보 확인(4.1과 같음) 뒤 분석은 아래 순서로 진행하고, 단계마다 진행 이벤트를 스트리밍한다(DEC-013).
```mermaid
sequenceDiagram
  participant U as 사용자
  participant A as API
  participant O as 오케스트레이터
  participant K as korean-law-mcp
  participant V as 인용 검증기
  U->>A: POST /inquiries/{id}/analyze (마스킹본)
  A->>O: 마스킹본 + 이어 묻기 맥락(최근 3개)
  O->>O: 질문 의도 분석 (Haiku)
  par 동시
    O->>K: 관련 법령 조문 검색
  and
    O->>K: 판례 검색·본문 조회
  end
  loop 에이전트 재검색 (최대 3라운드)
    O->>K: 법령·판례 도구 호출
  end
  O->>O: 근거 자료 안에서 답변 (Opus, 문단별 출처·원문 구절)
  O->>V: 답변
  V->>V: 출처·원문 구절 대조
  V->>K: verify_citations 재조회
  V-->>O: 실패 항목 제거 / 확인 필요 표시
  O-->>U: 결과(DEC-011 형식) + "AI 생성 · 법률 자문 아님"
```
- korean-law-mcp는 `lib/search` 안 어댑터 한 곳에서만 import한다. 나중에 수집 DB로 바꿀 때 어댑터만 갈아 끼운다.
- 판례 본문은 요청 메모리에서만 쓰고 저장하지 않는다(DEC-007).

### 4.3 Phase 2 상담 연결 `[게이트]`
F-014 "전문가 권장" → 에이전트 방향 조율(F-008) → 요약서 확인(F-009) → 공개 개요 생성·간접식별 점검(F-011) → 승인 변호사 열람(F-010) → 제안(F-012) → 사용자 선택 → 별도 동의 → 선택 변호사에게만 상세 제공 + 감사 기록.
각 단계 API는 게이트 검사를 먼저 수행한다.

## 5. 외부 연동
| 대상 | 용도 | 방식 | 실패 처리 | 상태 |
|---|---|---|---|---|
| 법제처 판례 본문 조회 API (공공데이터포털) | 판례 수집 | 배치 증분 | 재시도·실패 기록, 서비스는 기존 DB로 계속 | 확정(PRD 9.1) |
| 국가법령정보 공동활용 Open API | 법령·조문·시행일 | 배치 + 버전 관리 | 동일 | 확정(PRD 9.1), 상업 재게시 조건 확인 필요 |
| 대법원 판결서 인터넷 열람 | 원문 링크 | 링크만 | — | 수집 안 함 |
| korean-law-mcp 4.15.6 | 데모의 판례·법령 실시간 조회, 인용 재조회 | 서버에서 라이브러리 직접 호출(DEC-009) | `SEARCH_UPSTREAM_FAILED`, 재조회 실패는 "확인 필요" 표시 | 데모 확정 |
| Claude API | 구조화·요약·에이전트 | 서버 호출, 진행 단계 스트리밍(DEC-013) | `MODEL_FAILED` 구분 반환(F-006 AC2) | 후보(PRD 8.2) |
| 임베딩 모델 | 벡터 검색 | 수집 시·질의 시 | 키워드 검색만으로 폴백 (제안) | 미정 |
| 인증 | 소셜 로그인(Google 등)·역할·익명 세션 | Supabase Auth | 로그인 실패 시 비로그인 3회 범위로 유지 | 확정(DEC-004, DEC-005, DEC-010) |

LLM 호출 원칙: 마스킹본만 전송, 시스템 프롬프트·도구 정의를 고정해 프롬프트 캐싱, 응답·인용은 검증 후 저장.

## 6. 배포 구조
```mermaid
flowchart TB
  DEV[로컬] --> STG[스테이징] --> WEB
  subgraph PROD["운영"]
    WEB[웹 앱 · 호스팅 미정]
    SB[(Supabase · 리전 미정)]
    JOB[수집기 스케줄 실행 · 방식 미정]
  end
```
| 항목 | 내용 |
|---|---|
| 환경 | 로컬 / 스테이징 / 운영 (제안). 스테이징은 실제 사용자 데이터 없음 |
| 데모 배포 | Vercel(Hobby, GitHub main 자동 배포) `hamzzi-courthouse.vercel.app`, 서버 함수 리전 `icn1`(서울, `vercel.json`) · Supabase 개발 프로젝트 Seoul(ap-northeast-2). 환경변수는 Vercel 프로젝트 설정에 따로 넣는다(`SUPABASE_DB_URL` 제외). 법제처 호출은 도메인 등록 후 가능 (OQ-ARC-05). 운영 호스팅·플랜은 P11 전에 정한다 |
| 비밀 관리 | API 키는 서버 환경변수만, 클라이언트 노출 금지(PRD 13) |
| 마이그레이션 | DB 스키마는 마이그레이션 파일로 관리, 운영 반영은 사람 승인 |
| 정기 작업 | 데모: 보유 기간 파기 `purge_expired_records()`를 Supabase **pg_cron**(`hz-retention-purge`, 매일 03:17 UTC)으로 DB 안에서 실행한다 — 무료 플랜 사용 가능, 비밀값·외부 호출 없음 (DEC-018 제안, DATA_MODEL 7절). Vercel Cron은 쓰지 않는다 |
| 관측 | 기능별 장애·지연·LLM 비용·인용 검증 실패율 지표 (PRD 13, 14) |
| 성능 목표 | 판례 검색 p95 ≤ 3초, AI 분석 p95 ≤ 15초 (PRD 13). 데모는 AI 분석 p95 ≤ 90초 (DEC-013·014) — 서버 함수 실행 시간 120초(Vercel Hobby 한도 300초) |
| 백업 | RTO/RPO는 출시 전 정의 (PRD 13) |

## 7. 보안 요약
역할: `user` / `lawyer`(승인 후, Phase 2) / `admin`. 모든 사용자 데이터 테이블에 행 단위 보안(RLS) 적용. 원본 사건 데이터 접근은 감사 로그 필수. 상세 권한표는 `DATA_MODEL.md` 5절.

---
## OPEN QUESTION
| ID | 질문 | 영향 | 관련 PRD |
|---|---|---|---|
| ~~OQ-ARC-01~~ | ✅ 해결: 스택 확정 (DEC-004) | 전체 | 8.2 |
| OQ-ARC-02 | AI 오케스트레이터를 웹 앱(TypeScript) 안에 둘지, 별도 서비스(Python)로 분리할지 | 구성도, 배포 | 8.2 |
| OQ-ARC-03 | 임베딩 모델 선택과 차원 수 | 검색, DATA_MODEL | 8.2 |
| OQ-ARC-04 | 키워드 검색 엔진: Postgres 전문검색으로 충분한가, 한국어 형태소 분석 엔진이 필요한가 | 검색 품질(8.4 Top-5 ≥70%) | 8.4 |
| OQ-ARC-05 | 웹 호스팅·DB 리전(국내 보관 필요 여부)·수집기 실행 방식. 데모는 웹 서버도 법제처를 호출하므로 등록 가능한 IP·도메인 조건을 확인해야 한다 (DEC-009) | 배포 | 9.2(국외 이전) |
| ~~OQ-ARC-06~~ | ✅ 해결: 진행 단계를 스트리밍으로 표시 (DEC-013) | API, UI | 13 |
| OQ-ARC-07 | 유사도 임계값(F-006)과 재정렬 방식 | 검색 | F-006 |
| OQ-ARC-08 | LLM 제공업체로의 전송이 처리위탁/국외이전 중 무엇에 해당하며 어떤 고지가 필요한가 | 외부 연동 | 9.2 |
| OQ-ARC-09 | 관측 도구(에러·로그·제품 분석) 선택 | 배포 | 13, 14 |
