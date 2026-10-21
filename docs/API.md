# 햄찌법원 API 명세 (API)

> 기준: `docs/PRD.md` v1.3, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md` · 버전 v0.2 (2026-10-19)
> 데모(DEC-009~013): analyze는 4.1의 `DemoAnalysisResult`와 진행 단계 스트리밍을 쓰고, 이어 묻기는 `parentInquiryId`로 만든다.
> Base: `/api/v1` · JSON(UTF-8) · 시간은 ISO 8601 · 스키마는 TypeScript 표기 (`?` = 선택)
> `[게이트]` 엔드포인트는 해당 `feature_gates.status != approved`이면 항상 `403 FEATURE_GATED`.

## 1. 인증·권한
| 항목 | 내용 |
|---|---|
| 방식 | Supabase Auth 세션 토큰 (`Authorization: Bearer <token>` 또는 보안 쿠키) · 소셜 로그인(Google 등) (DEC-004, DEC-005) |
| 역할 | `anon`(비로그인) · `user` · `lawyer`(F-010 승인 후) · `admin` |
| 비로그인 | 익명 세션 쿠키 + IP 해시로 **질문 3회**(이어 묻기 포함)까지 허용. 네 번째 질문·추가 질문 답변·사실관계 수정은 `401 LOGIN_REQUIRED` (DEC-005, DEC-010, F-001 AC3) |
| 레이트 리밋 | 분석 계열에 적용 (값은 OQ-API-02). 초과 시 `429 RATE_LIMITED` |
| 멱등성 | 생성 POST는 `Idempotency-Key` 헤더 지원 (제안, OQ-API-03) |

## 2. 공통 형식
**성공**: `{ "data": T, "meta"?: { "requestId": string, "page"?: Page } }`
**실패**: `{ "error": { "code": ErrorCode, "message": string, "details"?: object, "requestId": string } }`
**모든 AI 결과**에 `"aiNotice": "AI 생성 · 법률 자문 아님"` 포함 (8.3).

```ts
type Page = { cursor?: string; nextCursor?: string; limit: number }
type CaseRef = { id: string; caseNo: string; caseName: string; court: string; decidedAt: string; sourceUrl: string }
type StatuteRef = { id: string; lawName: string; articleNo: string; effectiveFrom: string; effectiveTo?: string; sourceUrl: string }
type Citation = { kind: "case" | "statute"; ref: CaseRef | StatuteRef; status: "verified" | "unverified" }   // "removed"는 응답에 포함하지 않음
```

## 3. 에러 코드
| HTTP | code | 언제 | PRD |
|---|---|---|---|
| 400 | `EMPTY_INPUT` | 공백 입력 | F-001 AC2 |
| 400 | `VALIDATION_ERROR` | 필드 형식 오류 (`details.fields`) | — |
| 401 | `UNAUTHENTICATED` | 토큰 없음·만료 | 13 |
| 401 | `LOGIN_REQUIRED` | 비로그인 3회 사용 후 추가 요청 (`details.loginProviders`) | F-001 AC3, DEC-010 |
| 403 | `FORBIDDEN` | 역할·소유권 불일치 | 9.2 |
| 403 | `FEATURE_GATED` | 게이트 미승인 (`details.featureKey`, `details.status`) | F-013 |
| 403 | `LAWYER_NOT_VERIFIED` | 미승인 변호사 계정 | F-010 AC1 |
| 404 | `NOT_FOUND` | 리소스 없음. **판례·조문 404는 "검증 근거에 없음"을 뜻하며 대체 내용을 생성하지 않음** | F-003 AC3 |
| 409 | `CONSENT_REQUIRED` | 필요한 동의 없음 (`details.kind`) | F-007 AC2, F-009 AC2 |
| 409 | `INVALID_STATE` | 허용되지 않는 상태 전이 | F-012 AC3 |
| 422 | `PII_CONFIRMATION_REQUIRED` | PII 탐지 후 사용자 확인 전 분석 요청 | F-007 AC1 |
| 422 | `BRIEF_NEEDS_EDIT` | 간접 식별 위험 | F-011 AC2 |
| 429 | `RATE_LIMITED` | 호출 한도 초과 | — |
| 500 | `INTERNAL_ERROR` | 예상하지 못한 서버 오류. 메시지는 고정 문구, 예외 내용은 응답·로그에 넣지 않음 | F-007 |
| 502 | `SEARCH_UPSTREAM_FAILED` | 검색 저장소·외부 데이터 오류, 데모에서는 korean-law-mcp·법제처 호출 실패 (결과 없음과 구분) | F-006 AC2 |
| 502 | `MODEL_FAILED` | LLM 호출 실패 | F-006 AC2 |
| 504 | `TIMEOUT` | 처리 시간 초과 (재시도 가능 `details.retryable`) | 13 |

"결과 없음"은 에러가 아니다: `200` + `outcome: "no_result_in_scope"`.

## 4. Phase 1 엔드포인트
| 메서드 · 경로 | 인증 | 설명 | F-ID |
|---|---|---|---|
| POST `/inquiries` | anon(3회)·user | 문제 입력·이어 묻기, PII 탐지 | F-001, F-007 |
| POST `/inquiries/{id}/pii-confirmation` | 소유자(anon 포함) | 마스킹 확인·민감정보 동의 | F-007 |
| POST `/inquiries/{id}/analyze` | 소유자(anon 포함) | 구조화 + 검색 + 근거 요약 | F-002~F-006 |
| PATCH `/inquiries/{id}/facts` | user 소유자 | 사실관계 요약 수정 | F-002 AC1 |
| POST `/inquiries/{id}/answers` | user 소유자 | 추가 질문 답변 | F-002 AC2 |
| GET `/inquiries/{id}/result` | 소유자(anon 포함) | 최신 결과 조회 | 8.3 |
| GET `/me/quota` | anon·user | 남은 비로그인 질문 수(0~3), 로그인 필요 여부 | DEC-010 |
| GET `/cases` | 공개/user | 판례 직접 검색 | F-003 |
| GET `/cases/{id}` | 공개/user | 판례 상세 | F-003 AC3 |
| GET `/statutes/{id}` | 공개/user | 조문 + 시행일 | F-004 |
| POST `/results/{id}/feedback` | 소유자 | 도움 여부 | 14 |
| DELETE `/me/data` | user | 삭제 요청 | 9.2 |
| GET `/admin/feature-gates` · PATCH `/admin/feature-gates/{key}` | admin | 게이트 조회·변경 | F-013 |

### POST `/inquiries`
```ts
// req
{ text: string;                        // 1~OQ-API-01자 (임시 2000자)
  sensitiveConsent?: boolean;          // 민감정보 별도 동의 (F-007 AC2)
  parentInquiryId?: string }           // 이어 묻기: 같은 소유자의 분석 완료 inquiry (F-002 AC3, DEC-011)
// 201
{ id: string; status: "draft";
  piiFindings: { type: "name"|"phone"|"rrn"|"account"|"email"|"address"; count: number }[];  // 값은 반환하지 않음
  maskedText: string;
  piiConfirmationRequired: boolean }   // PII가 탐지됐으면 true → pii-confirmation 후 분석
```
에러: `EMPTY_INPUT`, `VALIDATION_ERROR`, `CONSENT_REQUIRED`(민감정보 가능성 + 동의 없음, `details.categories`: `health`/`criminal_record`), `LOGIN_REQUIRED`(익명 세션이 이미 3회 사용), `FORBIDDEN`·`INVALID_STATE`(`parentInquiryId`가 남의 것이거나 분석 전), `RATE_LIMITED`.
민감정보(건강·범죄경력) 가능성이 있으면 **동의 전에는 저장하지 않는다**: `409 CONSENT_REQUIRED`를 받은 클라이언트가 동의 화면을 보여 준 뒤 같은 입력을 `sensitiveConsent: true`로 다시 보낸다 (DATA_MODEL `[PII-S]` "별도 동의 후 저장").
원문은 PII 필터 처리 후 즉시 버리며 DB·응답·로그 어디에도 남기지 않는다 — 저장되는 것은 `maskedText`뿐 (DEC-006).
비로그인 질문은 "가벼운 답변"으로 처리한다: 추가 질문 없이 질문마다 분석 한 번만 제공 (범위 상세는 OQ-API-08).
데모에서는 비로그인도 로그인 사용자와 같은 분석을 3회까지 받는다(DEC-010, DEC-011). 질문 1회는 `analyze`가 성공했을 때 센다. 이어 묻기도 새 inquiry이므로 PII 점검과 횟수 계산을 똑같이 거친다.

### POST `/inquiries/{id}/pii-confirmation`
```ts
// req
{ acceptMasked: boolean }
// 200
{ id: string; status: "draft"; readyToAnalyze: true }
```
`acceptMasked: false`는 `400 VALIDATION_ERROR`(`details.reason: "resubmit_with_edits"`) — 내용을 고쳐 새로 제출한다. 분석 전 확인이 없으면 analyze가 `422 PII_CONFIRMATION_REQUIRED`. 민감정보 동의는 POST `/inquiries`에서 받는다.

### GET `/me/quota`
```ts
// 200 — 조회만 한다. 쿠키 없는 첫 방문자에게 익명 세션을 만들지 않는다
{ anonymous: boolean;          // 로그인 사용자면 false
  used: number | null;         // 비로그인 사용 횟수 0~3 (로그인 사용자 null)
  limit: number | null;        // 3 (DEC-010)
  remaining: number | null;
  loginRequired: boolean }     // 3회를 다 쓴 비로그인
```
비로그인 횟수는 `analyze` 성공 때 DB 함수 `consume_anon_question`이 올린다(세션 3회 + 같은 IP 해시 24시간 10회, DATA_MODEL `anon_usage`). 세션 초과는 `401 LOGIN_REQUIRED`, IP 상한 초과는 `429 RATE_LIMITED`(`details.reason: "anon_ip_daily"`). 로그인 사용자 사용량 제한은 미정(PRD 11).

### POST `/inquiries/{id}/analyze`
```ts
// 200 (정보 부족)
{ status: "need_info"; questions: { id: string; ord: 1|2|3; text: string }[] }
// 200 (분석 완료)
{ status: "analyzed"; resultId: string; result: AnalysisResult }

type AnalysisResult = {
  outcome: "grounded" | "no_result_in_scope" | "ai_suggestion";   // F-006
  aiNotice: string;
  summary: string;
  facts: { stated: string[]; inferred: string[]; toConfirm: string[] };   // F-002 AC1
  issues: string[];
  cases: (CaseRef & { relevance: number; holding: string; differences: string[] })[];  // relevance ≠ 승소 가능성
  statutes: { cited: StatuteRef[]; possiblyRelevant: StatuteRef[] };     // F-004
  nextSteps: string[];
  suggestionLabel?: "AI 추천(판례 근거 아님)";                            // outcome=ai_suggestion일 때 필수
  citations: Citation[];
  searchScopeNote: string;                                                // 예: 형사 미확정·소액사건 판결 미포함
}
```
에러: `PII_CONFIRMATION_REQUIRED`, `SEARCH_UPSTREAM_FAILED`, `MODEL_FAILED`, `TIMEOUT`.
규칙: 응답 내 모든 사건번호·조문은 `result_citations`에서 `verified` 또는 `unverified`인 것만 포함(F-005).

#### 4.1 데모 응답 (DEC-009, DEC-011, DEC-013)
데모의 analyze는 정보 부족(`need_info`)을 반환하지 않고 항상 아래 결과를 낸다.
```ts
// 200
{ status: "analyzed"; resultId: string; result: DemoAnalysisResult }

type DemoAnalysisResult = {
  outcome: "grounded" | "no_result_in_scope";       // 근거 자료가 없으면 no_result_in_scope (F-006)
  aiNotice: "AI 생성 · 법률 자문 아님";              // 고정 문구. LLM이 만들지 않음
  intent: { area: string; goal: string; laws: string[]; lawKeywords: string[] };
  answer: { points: { text: string; source: string; quote: string;          // quote = 원문 그대로 20~60자. quote_mismatch면 "" (원문에 없는 구절은 내보내지 않음)
                      check: "verified" | "quote_mismatch" }[] };           // 출처 없음·재조회 실패·실존 미확인 문단은 제외
  articles: (StatuteRef & { title: string; used: boolean })[];             // 법령 탭
  cases: (CaseRef & { fromBody: boolean; used: boolean })[];               // 판례 탭. fromBody = 판시사항·요지가 없어 본문 일부를 근거로 씀
  searches: { keyword: string; total: number }[];
  trace: { round: 1|2|3; tool: "law" | "precedent"; query: string; added: string[] }[];   // AI가 더 찾아본 것
  recheck: { ok: boolean; items: { citation: string; exists: boolean; note?: string }[]; removed: number }; // verify_citations 결과(검증 탭). items는 남은 문단이 쓴(실존 확인된) 인용만, ok = 실존 미확인으로 뺀 문단이 없음, removed = 검증·1차 거르기에서 뺀 문단 수(내용은 내보내지 않음, DEC-014)
  searchScopeNote: string;
}
```
- 이어 묻기면 부모 inquiry 사슬의 최근 3개 질문·답변을 맥락으로만 쓰고, 근거는 다시 검색한다.
- 상태: `draft`·`failed`(재시도)만 분석한다. 이미 `analyzed`면 `409 INVALID_STATE`(횟수 이중 차감 방지). 실패하면 `failed`로 바뀐다.
- 비로그인은 모델을 부르기 전에 세션 3회(`401 LOGIN_REQUIRED`)·IP 해시 24시간 상한(`429 RATE_LIMITED`)을 미리 보고, 최종 차감은 결과 저장과 한 트랜잭션(DB `finish_demo_analysis`)에서 한다.
- 스트림이 끊겨도 분석은 끝까지 저장되며, 결과는 `GET /inquiries/{id}/result`로 다시 볼 수 있다.
- 스트림을 연 뒤의 오류는 `error { code, message, details?, requestId }` 이벤트로 보낸다(HTTP 상태는 200). 스트림 전 검사 오류는 일반 JSON 오류다. 함수 실행 한도 120초(`maxDuration`), 분석 예산 100초 (DEC-014, 목표 p95 ≤ 90초).
- 출처가 그 요청의 자료에 없거나 `verify_citations`에서 실존이 확인되지 않은 문단은 응답에서 뺀다. 원문 구절만 다르면 `quote_mismatch`로 "확인 필요"를 표시한다(F-005 AC2).
- **스트리밍**: `Accept: text/event-stream`이면 SSE로 진행 단계를 보낸다. 이벤트는 `step { stage: "intent"|"search"|"agent"|"answer"|"verify"; message: string; added?: string[] }`, 마지막에 `result { resultId, result }` 또는 `error { code, message }`. 이벤트에도 입력 원문을 넣지 않는다.

### PATCH `/inquiries/{id}/facts`
`req { stated?: string[]; toConfirm?: string[] }` → `200 { id, userEdited: true }`. 수정 후 재분석은 `analyze` 재호출.

### POST `/inquiries/{id}/answers`
`req { answers: { questionId: string; text: string }[] }` → `200 { readyToAnalyze: boolean }`. 답변도 PII 필터를 거친다.

### GET `/cases`
```ts
// query
q: string (필수, 공백이면 EMPTY_INPUT); court?: string; caseType?: string; from?: date; to?: date; cursor?: string; limit?: number (≤ 50)
// 200
{ items: (CaseRef & { relevance: number })[]; outcome: "grounded" | "no_result_in_scope"; searchScopeNote: string }
```
개인정보 필드는 반환하지 않는다(F-003 AC1). `deid_check='passed'` 판례만 반환한다(`pending`·`flagged` 제외).

### GET `/cases/{id}`
`200 { ...CaseRef, caseType, holdingSummary, sections: { section: string; text: string }[], citedStatutes: { raw: string; statute?: StatuteRef }[] }` · 없으면 `404 NOT_FOUND`.
전문 제공 범위는 OQ-DM-05 결과에 따라 `sections`를 요지·링크로 제한할 수 있다.

### GET `/statutes/{id}?asOf=YYYY-MM-DD`
`200 { ...StatuteRef, articleTitle, body, isCurrent: boolean, versionAtDate?: StatuteRef }` — `asOf`가 있으면 그 시점 버전을 함께 반환(F-004).

### POST `/results/{id}/feedback`
`req { helpful: boolean; comment?: string }` → `204`. comment는 마스킹 후 저장.

### DELETE `/me/data`
`202 { requestId, status: "received" }` — 처리 기한은 OQ-DM-03.

### PATCH `/admin/feature-gates/{key}`
```ts
// req
{ status: "pending_review"|"conditional"|"approved"|"excluded"; conditions?: { item: string; resolved: boolean }[]; reviewRef: string; reason: string }
// 200
{ featureKey, status, conditions, reviewRef, approvedAt?, unresolved: string[] }
```
규칙: `approved`로 바꾸려면 모든 `conditions.resolved = true`이고 `reviewRef`가 있어야 함(F-013 AC2) → 아니면 `409 INVALID_STATE` + `details.unresolved`(미완료 항목, F-013 AC1). 모든 변경은 `gate_changes`에 기록. 승인 요청으로 기존 조건 항목을 지울 수 없다(지운 항목은 미해결로 봄). `reviewRef`를 비워 보내면 기존 값을 유지한다. 모르는 키는 `404`.
`GET /admin/feature-gates`는 게이트마다 `unresolved`(승인 전에 끝내야 할 항목)를 함께 준다.
구현: DB 함수 `change_feature_gate`가 상태 변경·`gate_changes`·`audit_logs`를 한 트랜잭션으로 남기고, `feature_gates`는 이 함수 밖에서 수정·삭제할 수 없다(트리거).

## 5. Phase 2 엔드포인트 `[게이트]`
PRD의 법률 게이트는 F-010~F-012(`lawyer_verification`·`brief_posting`·`proposals`)다. `consult_agent`(F-008, OQ-003 검토 대상)와 `procedure_guide`(F-014)는 같은 `feature_gates` 테이블로 켜고 끄는 **Phase 2 출시 플래그**로 쓴다.

| 메서드 · 경로 | 인증 | 설명 | 게이트 키 | F-ID |
|---|---|---|---|---|
| GET `/procedures?caseType=` | user | 절차 단계·기간·난이도 라벨 | `procedure_guide` | F-014 |
| POST `/inquiries/{id}/agent/messages` | 소유자 | 방향 제안·동의/비동의 대화 | `consult_agent` | F-008 |
| POST `/inquiries/{id}/summary` | 소유자 | 사건 요약서 생성 | `consult_agent` | F-008 AC2 |
| POST `/summaries/{id}/confirm` | 소유자 | 내용 확인 | `brief_posting` | F-009 AC1 |
| POST `/consents` · DELETE `/consents/{id}` | user | 동의·철회 | — | F-009 AC3 |
| POST `/briefs` | 소유자 | 비식별 개요 게시 | `brief_posting` | F-011 |
| GET `/lawyer/briefs` | lawyer | 게시된 개요 목록 | `brief_posting` | F-010, F-011 |
| POST `/lawyer/verification` | user→lawyer 신청 | 자격 확인 신청 | `lawyer_verification` | F-010 |
| POST `/lawyer/briefs/{id}/proposals` | lawyer | 상담 제안 | `proposals` | F-012 AC1 |
| GET `/briefs/{id}/proposals` | 소유자 | 받은 제안 | `proposals` | F-012 |
| POST `/proposals/{id}/select` | 소유자 | 변호사 선택 | `proposals` | F-012 AC2 |
| POST `/proposals/{id}/disclosures` | 소유자 | 선택 변호사에게 상세 제공 | `proposals` | F-012 AC2 |
| PATCH `/proposals/{id}/status` | 소유자/lawyer | 상태 전이 | `proposals` | F-012 AC3 |

핵심 스키마:
```ts
// GET /procedures (F-014)
{ caseType: string; steps: { ord: number; label: string; duration: { min: number; max: number; unit: "day"|"week"|"month" }; difficulty: "self"|"depends"|"expert"; source: string }[]; aiNotice: string }

// POST /inquiries/{id}/agent/messages (F-008)
req { message?: string; decision?: "agree" | "disagree"; reason?: string }
res { turn: { role: "agent"; content: string; proposedDirection?: { track: string; rationale: string; caseIds: string[] } }; agreed: boolean }

// POST /briefs (F-011) — 사전 조건: summary 확인 + consents(kind=brief_posting) 유효
req { summaryId: string; fields: ("title"|"field"|"regionLevel"|"amountRange"|"stage")[] }
201 { id; title; field; regionLevel; amountRange; stage; status: "posted" }
에러: CONSENT_REQUIRED, BRIEF_NEEDS_EDIT { details.flags: string[] }

// POST /lawyer/briefs/{id}/proposals (F-012)
req { message: string; feeNote?: string }
201 { id; status: "proposed" }

// POST /proposals/{id}/disclosures (F-012 AC2)
req { consentId: string; items: string[] }   // 동의한 항목만
201 { id; disclosedAt }                        // audit_logs 기록
```
상태 전이(F-012 AC3): `proposed → selected → in_consultation → closed`, 그 외 `declined`. 어떤 상태도 "선임 완료"를 뜻하지 않는다. 플랫폼의 자동 배정·추천 엔드포인트는 두지 않는다(DEC-001, N5).

## 6. 로깅 규칙
요청 로그에는 `requestId`, 경로, 상태 코드, 지연, 사용자 ID 해시만 남긴다. 본문(`text`, `message`, `comment`)과 PII 값은 기록하지 않는다(F-007, 13).

---
## OPEN QUESTION
| ID | 질문 | 영향 | 관련 PRD |
|---|---|---|---|
| OQ-API-01 | 입력 최대 길이(자) | POST /inquiries | F-001 |
| OQ-API-02 | 레이트 리밋 값(사용자·IP별, 분석 계열) | 전체 | 11(비용), 13 |
| OQ-API-03 | 멱등 키 지원 범위 | 생성 POST | — |
| OQ-API-04 | API 버전 관리 정책(`/v1` 유지 기간) | 전체 | — |
| OQ-API-05 | 변호사 제안 시 공개할 프로필·단가 필드와 광고 표시 방식 | proposals, lawyer_profiles | 10.1 A, OQ-001 |
| OQ-API-06 | 공개 판례 검색(`GET /cases`)도 비로그인 질문 횟수 제한(3회)에 포함할지, 별도로 열지 | 인증 | DEC-005 |
| OQ-API-08 | 비로그인 "가벼운 답변"의 범위: 판례 몇 건까지, 법령 상세·원문 링크 포함 여부, 결과 저장 여부. 데모는 로그인 사용자와 같은 결과를 저장까지 함(DEC-010·011), 데모 뒤 재검토 | analyze 응답 | DEC-005 |
| OQ-API-09 | Google 외에 지원할 소셜 로그인(카카오·네이버 등) | 인증 | DEC-005 |
| OQ-API-07 | 관리자 작업(게이트 변경)에 2단계 승인을 둘지 | admin | F-013 |
