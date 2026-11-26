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
| 비로그인 | 익명 세션 쿠키 + IP 해시로 **하루 질문 10회**(이어 묻기 포함, DEC-055 — 이전 5회, `ANON_QUESTION_LIMIT`)까지 허용. 아래의 "3회"는 이 값으로 읽는다. 그다음 질문·추가 질문 답변·사실관계 수정은 `401 LOGIN_REQUIRED` (DEC-005, DEC-010, F-001 AC3) |
| 레이트 리밋 | 분석: 비로그인 세션 3회 + IP 해시 24시간 10회(DEC-010). 판례·조문 검색: IP 해시 1시간 목록 60회·상세 120회(DEC-017 제안). 피드백·기록 삭제: IP 해시 1시간 30회. 초과 시 `429 RATE_LIMITED` (`details.reason`) |
| 멱등성 | 생성 POST는 `Idempotency-Key` 헤더 지원 (제안, OQ-API-03) |

## 2. 공통 형식
**성공**: `{ "data": T, "meta"?: { "requestId": string, "page"?: Page } }`
**실패**: `{ "error": { "code": ErrorCode, "message": string, "details"?: object, "requestId": string } }`
**모든 AI 결과**에 `"aiNotice": "AI 생성 · 무료 법률 상담"` 포함 (8.3).

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
| 409 | `CONSENT_REQUIRED` | 필요한 동의 없음 (`details.kind`) | F-007 AC2, F-009 AC2, F-015 AC1 |
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
| POST `/inquiries` | anon(하루 `ANON_QUESTION_LIMIT`회 — 현재 5, DEC-031 · 관리자 모드 무제한)·user(Google 로그인 하루 `USER_QUESTION_LIMIT` 10회, DEC-035) | 문제 입력·이어 묻기, PII 탐지 | F-001, F-007 |
| POST `/inquiries/{id}/pii-confirmation` | 소유자(anon 포함) | 마스킹 확인·민감정보 동의 | F-007 |
| POST `/inquiries/{id}/analyze` | 소유자(anon 포함) | 구조화 + 검색 + 근거 요약 | F-002~F-006 |
| PATCH `/inquiries/{id}/facts` | user 소유자 | 사실관계 요약 수정 | F-002 AC1 |
| POST `/inquiries/{id}/answers` | user 소유자 | 추가 질문 답변 | F-002 AC2 |
| GET `/inquiries/{id}/result` | 소유자(anon 포함) | 최신 결과 조회 | 8.3 |
| GET `/me/quota` | anon·user | 오늘 남은 질문 수(비로그인 0~`ANON_QUESTION_LIMIT` · Google 로그인 0~10), 로그인 필요 여부, 관리자 모드 | DEC-010, DEC-024, DEC-035 |
| GET `/me/inquiries` | user | 내 세션의 질문(남기기로 한 질문, 마스킹본). 마이페이지 '내 세션'은 이 목록과 `GET /matters`를 최근 순으로 합쳐 보인다 | DEC-039, DEC-056 |
| GET `/me/profile` | user | 마이페이지 프로필: Google 로그인 때 인증 서비스가 받아 둔 이름·프로필 사진 주소(`{ name, avatarUrl }`, 없으면 null). 이메일은 싣지 않는다. 사진 주소는 googleusercontent.com의 https만. 새로 저장하지 않고 `no-store` | DEC-056 |
| GET `/auth/callback` (API 밖, `app/auth/callback`) | 공개 | Google 로그인에서 돌아오는 주소. Supabase 코드를 세션 쿠키로 바꾸고 `next`(사이트 안 경로만, `safeNextPath`)로 보낸다. 실패하면 `/me?login=failed` | DEC-035 |
| POST `/admin/session` · DELETE `/admin/session` | 공개 | 관리자 모드 켜기(비밀번호)·끄기 | DEC-024 |
| GET `/cases` | 공개 (질문 3회와 별개, DEC-017) | 판례 직접 검색 | F-003 |
| GET `/cases/{id}` | 공개/user | 판례 상세 | F-003 AC3 |
| GET `/statutes/{id}` | 공개/user | 조문 + 시행일 + 그 날짜의 조문 | F-004, DEC-029 |
| GET `/statutes/{id}/cases` | 공개 | 이 조문이 나오는 판례 | F-003, DEC-029 |
| GET·POST `/decisions` · GET `/decisions/{domain}/{id}` | 공개 | 법령해석례·헌재 결정례·조세심판 재결례·관세청 해석 검색·상세 | F-003, DEC-029 |
| GET `/laws/{name}/{view}` | 공개 | 법령 도구: 3단 비교·신구조문 대조·개정 연혁·별표·연계·위임 대조 | F-004, DEC-029 |
| GET·POST `/ordinances` · GET `/ordinances/{id}` | 공개 | 자치법규 검색·조문 | DEC-029 |
| GET·POST `/admin-rules` | 공개 | 행정규칙 검색 | DEC-029 |
| POST `/casefiles/read` | anon·user (하루 질문 횟수를 다 썼으면 차단 — 차감은 분석 때) | 서류 사진 판독 → 가린 사건 개요·요구·당사자 | F-015 AC1·AC2 |
| POST `/materials/read` | anon·user (하루 질문 횟수를 다 썼으면 차단 — 차감은 분석 때) | 질문·검색에 붙인 자료 사진 판독 → 가린 자료 정리·검색어 후보 | F-017 AC1·AC2 |
| POST `/businesses/lookup` | 공개 | 법인·사업자 공개 정보 조회(공식 API, AI 없음) | F-015 AC4 |
| GET·POST `/matters` · GET·PUT·DELETE `/matters/{id}` | user (본인 사건만) | 사건 진행: 내 사건 목록·만들기·읽기·저장·삭제 | F-016 AC1 |
| POST `/matters/read` | user | 서류 사진 읽기 → 사실·당사자·관계·요구·조항 | F-016 AC2 |
| POST `/matters/issues` | user | 쟁점 정리(가린 글 → 검색·답변·인용 검증) | F-016 AC3 |
| POST `/matters/company` | user | 기업 조사(웹 검색·가져오기 요약 + 공식 API) | F-016 AC4 |
| POST `/matters/summarize` | user | 찾은 글을 노트용으로 줄이기 | F-016 AC5 |
| POST `/results/{id}/feedback` | 소유자 | 도움 여부 | 14 |
| DELETE `/me/data` | anon(같은 익명 세션)·user | 내 기록 삭제·삭제 요청 | 9.2 |
| GET `/admin/feature-gates` · PATCH `/admin/feature-gates/{key}` | admin | 게이트 조회·변경 | F-013 |
| GET `/admin/procedure-labels` · PATCH `/admin/procedure-labels/{id}` | 관리자 모드 | AI 절차 분류 라벨 조회·승인·거절 | DEC-037 |
| GET·POST `/community/posts` | 공개(anon·user) | 커뮤니티 글 목록(`?board=`·`?cursor=`)·글쓰기. 비로그인은 `password` 필수 | DEC-047 |
| GET·PATCH·DELETE `/community/posts/{id}` | 공개 · 수정·삭제는 글쓴이(로그인 계정 또는 비밀번호), 삭제는 관리자 모드도 | 글 + 댓글 보기·수정·삭제 | DEC-047 |
| POST `/community/posts/{id}/comments` · DELETE `/community/comments/{id}` | 공개 · 삭제는 댓글 쓴이·관리자 모드 | 댓글 쓰기·삭제 | DEC-047 |
| POST `/community/posts/{id}/report` | 공개 | 글 신고(수만 센다) | DEC-047 |
| GET `/me/seeds` | user | 내 씨앗 잔액·할인 가치·오늘 적립 횟수 | DEC-047 |
| GET `/health` | 공개 | 운영 점검: DB·법제처 도달 여부, Claude 키 유무(무과금) | 13 (OQ-ARC-09) |

### POST `/inquiries`
```ts
// req
{ text: string;                        // 1~10,000자 (2026-11-25 사용자 요청, 이전 임시 2000자). 2,000자를 넘는 몫은 답변 상한·예산 가중치에 입력 비용을 더한다 (lib/ai/cost longInputAllowanceUsd)
  sensitiveConsent?: boolean;          // 민감정보 별도 동의 (F-007 AC2)
  parentInquiryId?: string;            // 이어 묻기: 같은 소유자의 분석 완료 inquiry (F-002 AC3, DEC-011)
  materials?: { kind: string; summary: string; details: string[]; gaps: string[] }[] }
                                       // F-017(DEC-058): POST /materials/read 결과를 사용자가 확인·수정한 것 (30개까지).
                                       // 서버가 판독 때와 같은 규칙으로 다시 가리고 거른 뒤 inquiries.materials에 둔다.
                                       // 자료에서 찾은 민감정보 범주도 sensitiveConsent 검사에 들어간다. 형식이 틀리면 400 (fields: ["materials"])
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

### GET `/me/inquiries` (DEC-039)
로그인 사용자가 `save: true`로 보낸 질문만, 최근 것부터 200건(`SAVED_LIST_LIMIT`, 이전 50 — 화면이 한 페이지 10개씩 나눠 보인다, DEC-056 ③). 비로그인은 `401 UNAUTHENTICATED`.
```ts
// 200
{ id: string; maskedText: string; status: "draft"|"need_info"|"analyzed"|"failed"; createdAt: string; followup: boolean }[]
```
POST `/inquiries` 본문의 `save?: boolean`(선택)이 참이고 요청자가 로그인 사용자일 때만 기록에 남긴다. 비로그인·관리자 모드 요청에서는 무시한다. 참·거짓이 아니면 `400 VALIDATION_ERROR`(`details.fields: ["save"]`).
로그인 사용자의 하루 한도는 DEC-035·055(하루 30회, `USER_QUESTION_LIMIT`)를 따른다.


### GET `/me/quota`
```ts
// 200 — 조회만 한다. 쿠키 없는 첫 방문자에게 익명 세션을 만들지 않는다
{ anonymous: boolean;          // 로그인 사용자면 false
  used: number | null;         // 오늘(한국 시간) 사용 횟수 — 비로그인 0~ANON_QUESTION_LIMIT(현재 5), Google 로그인 0~10 (관리자 모드 null)
  limit: number | null;        // 비로그인 ANON_QUESTION_LIMIT(DEC-010·024·031), Google 로그인 USER_QUESTION_LIMIT 10(DEC-035)
  remaining: number | null;
  loginRequired: boolean;      // 오늘 한도를 다 쓴 비로그인 (로그인 사용자는 항상 false — 한도 소진은 remaining 0)
  admin: boolean;              // 관리자 모드(DEC-024) — 횟수 제한 없음
  ai: boolean }                // AI 답변이 켜져 있는지(DEC-036). false면 화면이 답변 모드 선택을 숨긴다
```
비로그인 횟수는 `analyze` 성공 때 DB 함수 `consume_anon_question`이 올린다(세션 하루 `ANON_QUESTION_LIMIT`회 — 한국 시간 0시에 0부터 다시, 같은 IP 해시 24시간 10회, DATA_MODEL `anon_usage`). 관리자 모드는 차감·사전 검사를 하지 않는다. **예시 질문**(홈에 보이는 질문과 같은 문장, 공백·전각 차이 무시)은 저장된 분석을 재생하므로 `POST /inquiries`·`analyze` 모두 횟수를 보지 않고 차감도 하지 않는다(DEC-027) — 하루 횟수를 다 쓴 뒤에도 열 수 있다. 대신 같은 네트워크 1시간 30회까지(`429 RATE_LIMITED`, `reason: example_hourly`). 이어 묻기라도 문장이 예시와 같으면 맥락 없이 예시를 재생하고 세지 않는다.

### POST·DELETE `/admin/session` (DEC-024)
```ts
// POST req { passcode: string } — 서버 환경변수 ADMIN_PASSCODE(또는 ADMIN_PASSWORD)와 대조. 맞으면 httpOnly 쿠키 hz_admin(서명된 만료 시각, 7일)
// 200 { admin: true } · 틀리면 401 UNAUTHENTICATED · 둘 다 없으면 404 · 같은 네트워크 1시간 5번/사이트 하루 30번 넘으면 429
// DELETE → 쿠키 삭제, 200 { admin: false }. 본문·비밀번호는 로그에 남기지 않는다
``` 세션 초과는 `401 LOGIN_REQUIRED`, IP 상한 초과는 `429 RATE_LIMITED`(`details.reason: "anon_ip_daily"`). Google 로그인 사용자(DEC-035)는 하루 30회(`USER_QUESTION_LIMIT`, DEC-055, 한국 시간 0시 초기화, 예시 질문 제외)로, 오늘 저장된 분석 결과 수(`model` ≠ `replay`)를 `POST /inquiries`·`analyze`가 모델 전에 세어 넘으면 `429 RATE_LIMITED`(`details.reason: "user_daily"`). 로그인 전에 같은 브라우저에서 만든 질문을 로그인 뒤 분석하면 분석 전에 그 행을 계정에 연결(`claimInquiryForUser`)해 이 한도에 넣는다. 차감 트랜잭션이 따로 없어 같은 순간의 동시 요청은 한도를 조금 넘을 수 있다(질문 1건·주간 비용 상한은 그대로). 관리자 모드로 로그인하면 이 한도도 받지 않는다. 로그인 사용자는 같은 브라우저 익명 세션의 로그인 전 질문도 소유자로 본다.

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
  mode: "ai" | "replay" | "search_only";            // DEC-015: ai = Claude 분석(Pro), replay = 예시 질문 재생, search_only = 법제처 검색 전용(answer.points 빈 배열)
  outcome: "grounded" | "no_result_in_scope";       // 근거 자료가 없으면 no_result_in_scope (F-006)
  aiNotice: "AI 생성 · 무료 법률 상담";              // 고정 문구. LLM이 만들지 않음
  intent: { area: string; goal: string; laws: string[]; lawKeywords: string[] };
  section?: string;                                 // DEC-033: 질문 해석 호출이 고정 목록(lib/procedure/sections.ts)에서 고른 절차 섹션 라벨. 타임라인 선택에만 쓴다. 없으면 화면이 규칙으로 정한다
  answer: { points: { text: string; source: string; quote: string;          // quote = 원문 그대로 20~60자. quote_mismatch면 "" (원문에 없는 구절은 내보내지 않음)
                      check: "verified" | "quote_mismatch" }[] };           // 출처 없음·재조회 실패·실존 미확인 문단은 제외
  articles: (StatuteRef & { title: string; used: boolean })[];             // 법령 탭
  cases: (CaseRef & { fromBody: boolean; used: boolean })[];               // 판례 탭. fromBody = 판시사항·요지가 없어 본문 일부를 근거로 씀
  searches: { keyword: string; total: number }[];
  trace: { round: 1|2|3; tool: "law" | "precedent"; query: string; added: string[] }[];   // AI가 더 찾아본 것
  recheck: { ok: boolean; items: { citation: string; exists: boolean; note?: string }[]; removed: number }; // verify_citations 결과(검증 탭). items는 남은 문단이 쓴(실존 확인된) 인용만, ok = 실존 미확인으로 뺀 문단이 없음, removed = 검증·1차 거르기에서 뺀 문단 수(내용은 내보내지 않음, DEC-014)
  searchScopeNote: string;
  relatedSections?: string[];                       // DEC-042: 질문 해석이 함께 걸려 있다고 본 다른 절차 섹션 (최대 2). 없으면 생략
  channel?: "online" | "offline" | "both";          // DEC-042: 일이 벌어진 곳. 알 수 없으면 생략
  deep?: { parties: { label: string; role: string }[];        // DEC-041 DeepSearch 사건 구조 (시각자료의 재료). 사용자가 적은 사실만
           events: { when: string; who: string; what: string }[]; // 사연에 적힌 순서
           issues: { title: string; points: number[] }[];        // 쟁점과 그 쟁점에 답한 answer.points 순번(검증을 통과해 남은 것만)
           unknowns: string[];                                    // 답이 달라질 수 있는데 사연에 없는 사실
           plan?: { kinds: ("civil"|"criminal"|"administrative"|"family"|"labor"|"other")[]; // DEC-062 사건 정리판(긴 질문만): 절차 종류
                    sides: { party: string; side: "claimant"|"respondent"|"complainant"|"accused"|"agency"|"third"; actions: string[] }[]; // 당사자 자리와 할 수 있는 대응 (판정 아님)
                    prep: { item: string; why: string }[] } };    // 준비할 자료. 숫자는 사용자가 적은 것만, 조문·사건번호·단정 표현 없음
  timing?: { totalMs: number; previewMs?: number; stages: { stage: "prepare"|"intent"|"search"|"agent"|"answer"|"verify"|"finish"; ms: number }[] }; // DEC-063 단계별 분석 시간(잰 값)
  document?: { kind: string; formTitle: string; title: string; sections: { heading: string; body: string }[] }; // DEC-062 가상 문서: 예시 질문(가상 사연) 결과에만
  assistant?: "home" | "report" | "market";        // DEC-057: 전문 에이전트 대화에서 받은 답변이면 그 에이전트
  assistantTalk?: { reply: string; asks: string[] }; // DEC-057: 에이전트 대화 한마디(Haiku). 숫자·법령·판례·판정 표현이 없게 거른 것만
  materials?: { items: { kind: string; summary: string; details: string[]; gaps: string[];
                         points: number[] }[] };          // F-017(DEC-058): 질문에 붙인 자료(가린 정리)와 그 자료를 사실관계로 참고한 answer.points 순번
                                                           // (검증을 통과해 남은 것만). 자료는 출처가 아니다 — 문단의 source는 언제나 근거 키. 무료 모드면 points는 빈 배열
  procedureHint?:                                   // DEC-037: 규칙이 절차를 정하지 못했을 때 저장해 둔 AI 분류 라벨(승인된 것만). 없으면 생략
    | { kind: "track"; track: string }               // 검증해 둔 기존 타임라인 키
    | { kind: "custom"; title: string; steps: { label: string; difficulty: "self"|"depends"|"expert"; prepare: string[]; cautions: string[] }[] };
}
```
- **요청 본문(선택, DEC-036)**: `{ tier?: "light" | "pro" | "max" | null }` — 사용자가 고른 답변 단계(Light Haiku · Pro Sonnet · Pro Max Opus). 없으면 Pro Max(DEC-050, 이전 Pro). 세 값이 아니면 `400 VALIDATION_ERROR`(`details.fields: ["tier"]`). 무료 모드·예시 질문·주간 예산 초과면 무시된다.
- **아카이브 재생(DEC-057)**: 질문이 전문 에이전트 아카이브 질문과 같으면 예시 질문처럼 저장된 분석을 재생한다(횟수·예산 차감 없음, `mode: "replay"`).
- **요청 본문(선택, DEC-057)**: `{ assistant?: "home" | "report" | "market" | null }` — 분야별 비서 대화(F-018)로 보낸 질문. 라이트 답변에 그 비서의 지시문을 붙이고, 카테고리가 없으면 비서의 고정 판례 검색어·조문을 쓰며, 질문 낱말에 맞는 사례 판례(둘까지)를 법제처에서 다시 가져와 근거에 더한다. 답변 단계는 본문 `tier`와 상관없이 Pro Max(지금 Opus 5.5 effort high, DEC-050)로 고정하고(상한·예산 가중치도 그 단계), 같은 상한 안에서 Haiku 대화 한마디(`assistantTalk`)를 더한다. 횟수·인용 검증은 같다. 저장하지 않고 결과에 `assistant`·`assistantTalk`만 남긴다. 세 값이 아니면 `400 VALIDATION_ERROR`(`details.fields: ["assistant"]`).
- **요청 본문(선택, DEC-038)**: `{ deep?: boolean }` — DeepSearch로 보낸 질문. 같은 질문을 이미 분석 중이면 새로 시작하지 않고 `409 INVALID_STATE` + `details: { reason: "in_progress" }`(DEC-065 분석 잠금 — 화면은 결과가 저장될 때까지 GET 결과를 다시 읽는다). 가린 질문이 100자를 넘으면 이 값과 상관없이 DeepSearch(Opus 5.5 effort xhigh, 사건 정리판 포함)로 분석한다(DEC-062). 같은 비용 상한 안에서 모델에 넘겨 보는 근거를 조문 8·판례 4건까지 넓힌다. 참·거짓이 아니면 `400 VALIDATION_ERROR`(`details.fields: ["deep"]`).
- **요청 본문(선택, DEC-028)**: `{ category?: "lease"|"deposit"|"labor"|"fraud"|"traffic"|"neighbor"|"loan"|"family"|"inheritance"|"consumer"|"defamation"|"insult"|"assault"|"stalking"|"sex_crime"|"voice_phishing"|"crime_report"|"workplace_harassment"|"industrial_accident"|"domestic_violence"|"school_violence"|"medical"|"privacy"|"commercial_lease"|"respond_civil"|"respond_criminal"|"admin_appeal"|"debt_relief" | null }` — 홈 카테고리 버튼 값. 무료 법제처 판례 검색(무료 모드·라이트 답변)에 그 분야의 고정 판례 검색어(`lib/procedure/categories` `caseQuery`)를 하나 더할 뿐 분류·답변을 바꾸지 않는다. 본문이 없으면 카테고리 없음, 정해진 값이 아니거나 JSON이 깨졌으면 소유자 확인 전에 `400 VALIDATION_ERROR`(`details.fields: ["category"]` 또는 `reason: "invalid_json"`). 저장하지 않는다.
- **예시 답변 화면(DEC-028)**: 홈의 예시 카드는 이 API를 쓰지 않는다. `/examples/[id]`가 저장된 예시 분석(`mode: "replay"`와 같은 형식)을 빌드 때 정적으로 렌더링한다 — 질문 생성·분석·저장·횟수 차감 없음.
- **무료 모드(기본, DEC-015)**: Claude를 부르지 않는다. 질문이 예시 질문과 같으면 `mode: "replay"`(저장된 검증 결과), 아니면 `mode: "search_only"`(법제처 조문·판례 목록, 답변 문단 없음). 저장·비로그인 차감은 유료 분석과 같다. 무료 모드는 `AI_MODE=free`이거나 API 키가 없거나 주간 예산을 넘었을 때다 — 그 밖에는 `tier`의 모델로 실제 분석을 한다(DEC-036).
- 이어 묻기면 부모 inquiry 사슬의 최근 3개 질문·답변을 맥락으로만 쓰고, 근거는 다시 검색한다 (Pro 모드).
- 상태: `draft`·`failed`(재시도)만 분석한다. 이미 `analyzed`면 `409 INVALID_STATE`(횟수 이중 차감 방지). 실패하면 `failed`로 바뀐다.
- 비로그인은 모델을 부르기 전에 세션 3회(`401 LOGIN_REQUIRED`)·IP 해시 24시간 상한(`429 RATE_LIMITED`)을 미리 보고, 최종 차감은 결과 저장과 한 트랜잭션(DB `finish_demo_analysis`)에서 한다.
- 스트림이 끊겨도 분석은 끝까지 저장되며, 결과는 `GET /inquiries/{id}/result`로 다시 볼 수 있다.
- 스트림을 연 뒤의 오류는 `error { code, message, details?, requestId }` 이벤트로 보낸다(HTTP 상태는 200). 스트림 전 검사 오류는 일반 JSON 오류다. 함수 실행 한도 120초(`maxDuration`), 분석 예산 100초 (DEC-014, 목표 p95 ≤ 90초).
- 출처가 그 요청의 자료에 없거나 `verify_citations`에서 실존이 확인되지 않은 문단은 응답에서 뺀다. 원문 구절만 다르면 `quote_mismatch`로 "확인 필요"를 표시한다(F-005 AC2).
- **스트리밍**: `Accept: text/event-stream`이면 SSE로 진행 단계를 보낸다. 이벤트는 `step { stage: "intent"|"search"|"agent"|"answer"|"verify"; message: string; added?: string[] }`, 유료 분석(답변 모델이 Haiku가 아닐 때)은 그 사이에 `preview { summary: string; checks: string[]; nextSteps: string[] }`를 한 번 보낼 수 있다(DEC-064 빠른 답 먼저 — Haiku 요약, 조문·사건번호·사연에 없는 숫자·단정 표현 없음, 저장하지 않음). 마지막에 `result { resultId, result }` 또는 `error { code, message }`. 이벤트에도 입력 원문을 넣지 않는다.

### PATCH `/inquiries/{id}/facts`
`req { stated?: string[]; toConfirm?: string[] }` → `200 { id, userEdited: true }`. 수정 후 재분석은 `analyze` 재호출.

### POST `/inquiries/{id}/answers`
`req { answers: { questionId: string; text: string }[] }` → `200 { readyToAnalyze: boolean }`. 답변도 PII 필터를 거친다.

### GET `/cases`
```ts
// query
q: string (필수, 공백이면 EMPTY_INPUT, 100자 이하); limit?: number (1~20, 기본 10)
// 200
{ items: CaseRef[]; outcome: "grounded" | "no_result_in_scope"; searchScopeNote: string; notice: string }
```
- 같은 검색을 `POST /cases` `{ q, limit? }` 본문으로도 받는다. 화면은 POST를 쓴다 — 검색어가 주소·브라우저 기록·플랫폼 접속 기록에 남지 않게(F-007).
- 데모(DEC-009, DEC-017): 법제처 실시간 판례 검색(판례명+본문). 결과는 저장하지 않는다. 관련도 점수는 내지 않는다(PRD 8.3 — 승소 가능성처럼 보이지 않게). `court`·`caseType`·`from`·`to`·`cursor` 필터는 수집 DB 도입 후.
- 검색어도 법제처로 보내므로 개인정보로 보이면 보내지 않고 `400 VALIDATION_ERROR`(`details.reason: "personal_info"`) (F-007).
- `notice` = `SEARCH_NOTICE` ("법제처 검색 결과 · AI 생성 아님"). AI가 만든 내용이 없어 `aiNotice` 대신 쓴다.
- 개인정보 필드는 반환하지 않는다(F-003 AC1). 수집 DB를 쓰게 되면 `deid_check='passed'` 판례만 반환한다(`pending`·`flagged` 제외). 법제처 판례는 법원이 비실명 처리한 공개본이다.
- 레이트 리밋: 같은 IP 해시 1시간 60회 → `429 RATE_LIMITED` (`details.reason: "search_hourly"`). 법제처 실패는 `502 SEARCH_UPSTREAM_FAILED`.

### GET `/cases/{id}`
`200 { ...CaseRef, holdingSummary: string | null, sections: { section: "판시사항" | "판결요지" | "본문 일부"; text: string }[], fromBody: boolean, citedStatutes: { raw: string; id: string | null }[], notice }` · 없으면 `404 NOT_FOUND`(대체 내용 생성 안 함, F-003 AC3).
- `id` = 법제처 판례일련번호(숫자). 전문은 주지 않는다(DEC-007, OQ-DM-05): 판시사항·판결요지, 둘 다 없을 때만 개인정보를 가린 본문 일부.
- `citedStatutes`는 참조조문 원문에 적힌 "법령명 제N조"만 뽑는다. 같은 쉼표 목록에서 법령명 없이 이어지는 조문만 앞 법령명을 잇는다. "구 법령"·괄호 설명·"부칙"이 끼면 현행 조문과 다를 수 있어 `id: null`(링크 없음)로 원문 그대로 준다. `id`는 `/statutes/{id}` 형식이며 화면은 `?asOf=선고일`로 연다. 상세 1시간 120회(`details.reason: "lookup_hourly"`).

### GET `/statutes/{id}?asOf=YYYY-MM-DD`
`200 { ...StatuteRef, articleTitle, body, isCurrent: boolean, asOf?, versionAtDate?: StatuteRef | null, asOfNote?, notice }` — `id` = `법령명:제N조(의M)` (법령명 띄어쓰기 없음, URL 인코딩). 없으면 `404`.
- `isCurrent` = 시행일이 오늘(한국 시각) 이전.
- **그 날짜의 조문 (DEC-029 제안)**: `asOf`가 현행 시행일보다 앞선 과거 날짜면 법제처 연혁에서 그날 시행 중이던 버전의 같은 번호 조문을 가져와 `atDate: { lawName, articleNo, articleTitle, body, effectiveFrom, version: LawVersion, sameAsCurrent, diff: [{ type: "same"|"removed"|"added", text }] }`로 준다(`LawVersion` = `{ mst, lawName, effectiveFrom, promulgatedAt, promulgationNo, revisionType }`, `diff`는 그날 조문 → 현행 조문 줄 단위 비교). 그날 시행 버전이 없거나(제정 전·폐지 후) 같은 번호 조문이 없거나 법제처 조회에 실패하면 만들지 않고 `atDate: null` + `asOfNote`. 조문 번호가 바뀐 경우는 따라가지 않는다.
- `asOf`가 시행일 이후이고 오늘 이전이며 조문이 지금 시행 중이면 그 시점에도 같은 조문이므로 `versionAtDate` = 현행 ref. 그 밖(시행일 이전·미래 날짜·시행 전 조문)은 시점별 조문을 만들지 않고 `versionAtDate: null` + `asOfNote` (F-004 AC1 — 판결 당시 조문 제공은 OQ로 남김).

### GET `/statutes/{id}/cases` (DEC-029 제안)
`200 { items: CaseRef[], outcome, searchScopeNote, notice }` — 판결 본문에 "법령명 제N조"가 나오는 판례(법제처 본문 검색, 최대 6건). 관련도 점수 없음, 느슨한 대체 검색 없음. 상세 상한(`lookup_hourly`)에 함께 센다.

### GET·POST `/decisions` · GET `/decisions/{domain}/{id}` (DEC-029 제안)
- `domain` = 결정문 12종 `interpretation`(법령해석례) · `constitutional`(헌재 결정례) · `admin_appeal`(행정심판 재결례) · `tax_tribunal`(조세심판 재결례) · `appeal_review`(소청심사 재결례) · `acr_special`(권익위 특별행정심판) · `customs`(관세청 해석) · `nts`(국세청 해석) · `ftc`(공정위) · `pipc`(개인정보위) · `nlrc`(노동위) · `acr`(권익위), 목록만 주는 5종 `treaty`(조약) · `school`(학칙) · `public_corp`(공사·공단 규정) · `public_inst`(공공기관 규정) · `english_law`(영문 법령). 그 밖이면 `404`.
- 검색 `?domain=&q=&limit=`(POST 본문 `{ domain, q, limit? }`, 화면은 POST — F-007) → `200 { domain, items: DecisionRef[], outcome, searchScopeNote, notice }`. `DecisionRef` = `{ domain, id, title, refNo, agency, decidedAt, dateLabel, hasDetail, sourceUrl: string | null }` — `dateLabel`은 날짜가 뜻하는 것(회신·종국·의결·등록·시행 등), `hasDetail: false`인 종류(국세청 해석과 목록만 주는 5종)는 상세가 `404`. 검색어 규칙·상한은 `/cases`와 같다(`search_hourly`).
- 상세 → `200 { ...DecisionRef, sections: [{ section, text }], fromBody, notice }`. **요지 항목만** 준다(질의요지·회답 / 판시사항·결정요지·심판대상조문·참조조문 / 주문·청구취지·재결요지·처분요지·관련법령 / 판정사항·판정요지·판정결과). 위원회 결정문은 `의결서` 안의 주문·결정요지만 읽고, 모든 항목은 개인정보로 보이는 표현을 가려서 준다(F-007). 이유·전문은 주지 않고, 요지가 모두 없을 때만 개인정보를 가린 본문 일부(`fromBody`)를 준다(DEC-007과 같은 원칙). 법제처에 없으면 `404`.
- AI 생성물이 없으므로 `notice` = `SEARCH_NOTICE`.

### GET `/laws/{name}/{view}` (DEC-029 제안)
`name` = 법령명(약칭 가능, URL 인코딩), `view` = `articles` · `three-tier` · `old-new` · `history` · `annexes` · `impact`. 법령을 못 찾거나 없는 `view`면 `404`. 모든 응답에 `lawName`(정식 이름)·`sourceUrl`·`notice`. 상세 상한에 함께 센다.
- `articles` → `{ articles: [{ articleNo, title, text, effectiveFrom }] }` — 현행 법령 전문(조문 단위). 화면은 보고 있는 조문을 따라 `GET /statutes/{id}/cases`로 판례 패널을 갱신한다.
- `three-tier` → `{ rows: [{ articleNo, title, text, delegations: [{ type, lawName, articleNo, title, text }] }] }` — 법제처 3단비교(위임조문).
- `old-new?mst=` → `{ old, new: LawVersion | null, oldRows, newRows: [{ no, text, changed: string[] }] }` — 법제처 신구법 대조표. `mst` 없으면 현행과 직전, 있으면 그 버전과 직전. 다른 법령의 `mst`면 `404`. `changed`는 법제처가 표시한 바뀐 부분.
- `history` → `{ versions: LawVersion[] }` — 시행일 내림차순.
- `annexes` → `{ items: [{ no, title, kind, fileUrl, pdfUrl }] }` — 별표·서식 목록과 법제처 파일 주소(인증키가 든 주소는 주지 않음).
- `impact` → `{ articleCount, lower: [{ articleNo, title, delegations }], ordinances: [{ lawName, lawArticleNo, ordinanceId, ordinanceName, ordinanceArticleNo }], checks: [{ articleNo, title, phrase, linked }], impactNote, delegationNote }` — 법제처 3단비교·법령-자치법규 연계에 등록된 관계와, 조문의 위임 문구("대통령령으로 정한다" 등) 대비 연결 수. **영향 크기·중요도·입법 공백 여부는 판정하지 않는다**(절대 규칙 2).

### GET·POST `/ordinances` · GET `/ordinances/{id}` · GET·POST `/admin-rules` (DEC-029 제안)
- 자치법규 검색 → `{ items: [{ id, name, region, kind, effectiveFrom, promulgatedAt, sourceUrl }], outcome, searchScopeNote, notice }`, 상세 → `{ ...위 항목, articles: [{ articleNo, title, text }], notice }`. `id` = 법제처 자치법규일련번호.
- 행정규칙 검색 → `{ items: [{ id, name, kind, agency, issuedAt, effectiveFrom, sourceUrl }], … }` — 현행만, 본문은 법제처 원문 링크로.
- 검색어 규칙·상한은 `/cases`와 같다.

### POST `/casefiles/read` (F-015, DEC-052)
`req { images?: { mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; data: string(base64) }[]; texts?: { name: string; text: string }[]; question?: string (500자 이하); consent: { images: true; sensitive: true } }` — images·texts 합쳐 1~30개 (2026-11-24, 이전 사진 1~5장)
→ `200 { reading: { docTypes: string[]; summary: string; claims: string[]; parties: { role; side: "claimant" | "respondent" | "other"; kind: "business" | "agency" | "person"; name }[] } | null; piiFindings: { type; count }[]; sensitive: string[]; dropped: number; ai: { used: true } | { used: false; reason: "free_mode" | "budget" | "cost_cap" | "model_failed" | "unreadable" }; notice: "AI 생성 · 무료 법률 상담" | null }` (`cache-control: no-store`)
- **동의**: 사진 전송(`consent.images`)과 민감정보 처리(`consent.sensitive`)를 따로 받는다. 하나라도 `true`가 아니면 `409 CONSENT_REQUIRED` + `details.kind` `casefile_images`·`sensitive_info` — 사진을 모델로 보내지 않는다.
- **사진**: 서류 사진은 미리 가릴 수 없어 판독 호출(Haiku 비전 1회)에만 그대로 쓴다(절대 규칙 4의 예외) — 토큰 세기 호출에도 사진을 보내지 않고 장당 고정값으로 상한을 확인한다. 사진·판독 원문은 저장·로그하지 않는다. 사진 한 장 base64 820,000자, 전체 4,000,000자까지. 종류는 내용 앞부분으로 다시 확인한다. 넘으면 `400 VALIDATION_ERROR` + `details.reason` `too_many`·`too_large`·`media_type`·`encoding`(값은 싣지 않는다), 사진이 없으면 `400 EMPTY_INPUT`.
- **PDF·문서 (2026-11-24 사용자 요청)**: PDF는 사진과 같은 동의 뒤 document 블록으로 그대로 보낸다(한 개 base64 1,200,000자, 쪽 수 합계 20쪽 — 넘으면 `too_large`·`too_many_pages`). 한글·워드·파워포인트·엑셀·텍스트 문서는 브라우저가 글만 꺼내 `texts`로 보내고(전체 20,000자, `name`은 확장자만 쓴다), 서버가 `scanInput`으로 가린 글만 모델에 보낸다. 사건 진행 `POST /matters/read`도 같은 본문을 받는다. 판독 1건 상한 $0.015(임시값, 실제 쓴 금액만 기간 예산에서 뺀다).
- **응답**: `docTypes`는 정해진 목록(`DOC_TYPES`)의 값뿐이다. `summary`·`claims`는 가린 문장이다 — `scanInput`에 더해, 모델이 따로 적어 준 개인 이름 목록(응답에 싣지 않고 버린다)·서류 역할어 뒤의 이름 꼴·차량번호·생년월일·지번 주소를 가린다. 조문 번호·사건번호(지급명령·가사 등 사건부호 포함)가 든 문장과, 사건 개요에서 결과·유불리를 내다보는 문장은 빠지고 그 수가 `dropped`에 실린다(내용은 싣지 않는다). 서류의 주장을 옮긴 요구·주장 칸에는 판정 표현 검사를 걸지 않는다(단정 표현만). `parties`의 `name`은 표지(주식회사·법원 등)가 있는 상호·기관 이름만 있고 대표자·담당자 이름과 직함은 잘라 낸다. 개인(`person`)은 언제나 빈 문자열이다. `role`은 서류에 적힌 절차상 역할(발신인·수신인·원고·피고·피의자 등 정해진 값 — "피해자"·"가해자"는 없다), `side`는 서류에서의 자리이며 옳고 그름을 뜻하지 않는다.
- **횟수·비용**: 하루 질문 횟수를 다 썼으면 `401 LOGIN_REQUIRED`(비로그인)·`429 RATE_LIMITED`(`reason: "user_daily"`)로 모델 전에 막는다. 차감은 하지 않는다 — 확인한 개요를 `POST /inquiries` → `/analyze`로 분석할 때 1회 센다. 같은 네트워크 1시간 10회(`reason: "casefile_hourly"`, 관리자 모드 제외). 1건 비용 상한 $0.005(임시값)와 전체 예산을 받고, 무료 모드·예산 초과·상한 초과·읽지 못함은 오류가 아니라 `ai.used: false`로 알린다.
- 판독 결과는 저장하지 않는다. 화면은 사용자가 확인·수정한 개요를 `POST /inquiries`(`sensitiveConsent: true`)로 보내고 `/analyze`에 `deep: true`를 붙인다. 당사자 목록은 브라우저(sessionStorage)에만 둔다.

### POST `/materials/read` (F-017, DEC-058)
`req { images?·texts? (사진·PDF·문서 글 합쳐 1~30개, /casefiles/read와 같다); question?: string (500자 이하); consent: { images: true; sensitive: true } }`
→ `200 { materials: { kind; summary; details: string[]; gaps: string[] }[]; queries: string[]; piiFindings: { type; count }[]; sensitive: string[]; dropped: number; ai: { used: true } | { used: false; reason: "free_mode" | "budget" | "cost_cap" | "model_failed" | "unreadable" }; notice: "AI 생성 · 법률 자문 아님" | null }` (`cache-control: no-store`)
- **검증·동의·사진**: `/casefiles/read`와 같다(같은 검사 함수·같은 모델 입력 블록 `documentBlocks`). 동의가 없으면 `409 CONSENT_REQUIRED`, 사진·PDF는 판독 호출(Haiku 비전 1회)에만 그대로 쓰고 문서 글은 가린 글만 보낸다. 저장·로그하지 않는다(절대 규칙 4 예외 하나, DEC-052·055). 자료 정리는 파일마다 하나다.
- **응답**: `kind`는 정해진 목록(`MATERIAL_KINDS`, lib/materials/limits.ts)의 값뿐이다. `summary`(무엇이 찍힌 자료인지)·`details`(사진에 적힌 날짜·금액·문구, 적힌 그대로)·`gaps`(확인하지 못한 것)는 가린 글이다 — `scanInput`에 더해 모델이 적어 준 개인 이름(응답에 싣지 않고 버린다)·역할어 뒤 이름 꼴·차량번호·생년월일·지번 주소를 가린다. 조문 번호·사건번호가 든 문장, 결과·유불리를 말하는 문장은 빠지고 그 수가 `dropped`에 실린다. `queries`는 검색 화면에서 고를 법률 용어 검색어(숫자·개인정보·판정 표현 없는 것, 3개까지). 자료가 증거로서 어떤 의미가 있는지는 판단하지 않는다.
- **횟수·비용**: `/casefiles/read`와 같다 — 하루 질문 횟수를 다 썼으면 모델 전에 막고, 차감은 자료를 붙인 질문을 분석할 때 1회. 같은 네트워크 1시간 한도는 서류 판독과 함께 센다(`reason: "casefile_hourly"`). 1건 상한 $0.015(서류 판독과 같은 임시값), 예산 10단위.
- 판독 결과는 저장하지 않는다. 질문 화면은 사용자가 확인·수정한 정리를 `POST /inquiries`의 `materials`(`sensitiveConsent: true`)로 보낸다. 검색 화면은 정리를 그 화면 메모리에만 두고, 고른 검색어로 지금처럼 법제처만 찾는다.

### POST `/businesses/lookup` (F-015 AC4, DEC-052)
`req { name: string (2~40자) }` → `200 { places: Source<{ title; category; address; roadAddress; link }>; corps: Source<{ corpName; address; establishedAt; industry; homepage }>; links: { label; url }[]; notice: "공개 자료 검색 결과 · AI 생성 아님 · 같은 곳인지 직접 확인 필요" }` (`no-store`), `Source<T> = { status: "ok" | "empty" | "no_key" | "failed"; items: T[] }`
- 모델을 쓰지 않는다. 출처는 네이버 지역 검색 API(`places`)와 공공데이터포털 금융위원회 기업기본정보(`corps`) — 둘 다 상호·법인만 돌려준다. 개인을 찾는 기능이 아니다.
- 대표자 이름·법인등록번호·사업자등록번호·전화번호는 싣지 않는다. 찾은 곳이 서류의 당사자와 같은 곳인지, 어떤 곳인지는 판단하지 않는다.
- 이름은 본문으로만 받는다(주소·접속 기록에 남지 않게). 연락처·주소·번호가 섞인 이름은 `400 VALIDATION_ERROR` + `details.reason: "contact_info"`, 상호·기관 표지(주식회사·법인·은행·법원 등)가 없는 이름(개인 이름·일반 낱말)은 `reason: "not_business"`로 외부에 보내지 않는다. 대표자·담당자 이름과 직함이 붙어 오면 잘라 낸 상호만 쓴다. 조회한 이름·결과는 저장하지 않는다.
- 키가 없으면 그 출처는 `no_key`, 외부 오류는 `failed`(오류 내용·키·요청 주소는 싣지 않는다). `links`(네이버 지도·인터넷등기소·DART)는 언제나 있다. 레이트 리밋: 같은 네트워크 1시간 30회(`reason: "business_hourly"`).

### 사건 진행 `/matters/*` (F-016, DEC-053)
모두 로그인 사용자만(비로그인 `401 UNAUTHENTICATED`), 응답은 `cache-control: no-store`. 정리 도구라 승패·유불리 항목이 없다. 규칙은 lib/matters/policy.ts, DB는 lib/matters/store.ts, AI 호출의 횟수·예산·정산은 lib/matters/ai-gate.ts 한 곳.

- **목록·만들기** `GET /matters` → `{ items: { id, title, updatedAt, counts: { docs, parties, issues, notes } }[] }` · `POST /matters` `{ title (80자 이하), data? }` → `201 { id, title, updatedAt, data }`. 계정당 30건(넘으면 `400` + `reason: "too_many_matters"`).
- **한 건** `GET /matters/{id}` → `{ id, title, updatedAt, data }` · `PUT` `{ title?, data? }` → `{ id, updatedAt }` · `DELETE` → `{ deleted: true }`. 남의 사건·없는 사건·모양이 다른 번호는 똑같이 `404 NOT_FOUND`.
- **`data`(MatterData)** `{ version: 1, summary, mySide, docs[], facts[], parties[], relations[], demands[], clauses[], issues[], notes[] }` — 모양은 lib/matters/model.ts. 서버가 모양·글자 수·개수·전체 크기(400KB)를 확인하고 모르는 키는 버린다. 이름은 그대로 저장하고 연락처·등록번호·계좌·주소 꼴은 저장 전에 가린다. 오류에는 필드 이름만 싣는다.
- **서류 읽기** `POST /matters/read` `{ images, consent: { images: true, sensitive: true } }`(검증·동의는 `/casefiles/read`와 같다) → `{ reading: { doc, parties[], relations[], facts[], demands[], clauses: { ref, gist, url? }[] } | null, citations: { checked, removed, failed } | null, ai, notice }`. 사진은 Haiku 비전 호출 한 번에만 가고 저장하지 않는다. 읽은 결과(당사자 이름·서류 날짜 포함) 속 법령 조문·사건번호는 법제처 재조회로 실존이 확인된 것만 남는다(띄어 쓴 긴 법령 이름·「」 이름·앞 조문에 이어 쓴 조문까지 잡고, "같은 법 제N조"·"일본 민법"·"구 민법"처럼 법령을 정할 수 없는 조문은 재조회하지 않고 늘 가린다. 재조회 문자열에 당사자 이름이 섞이면 법제처로 보내지 않고 가린다. 재조회 전체는 25초 한도. 확인 안 된 것은 글에서 `〔확인 안 된 조문〕`·`〔확인 안 된 사건번호〕`로 가리고 조항 목록에서 뺀다, 재조회 실패면 `failed: true`로 모두 가림). 확인된 법령 조항에는 법제처 주소(`url`)가 붙는다. `citations`는 개수만 싣는다. 결과도 여기서 저장하지 않는다(화면이 사건 자료에 합쳐 `PUT`으로 저장).
- **쟁점 정리** `POST /matters/issues` `{ text (10,000자 이하), matterId, personNames?, tier?, consent: true }` → `{ issues: { title, points: { text, label, url }[] }[], unknowns: string[], ai, notice }`. 글은 서버가 `scanInput` + 이름 목록으로 가린 뒤에만 모델·법제처 검색으로 보낸다. 이름 목록은 서버가 `matterId`의 저장된 당사자에서 직접 모으고(`maskNamesOf` — 개인 전부, 종류를 잘못 고른 사람 이름 꼴 포함) 브라우저가 보낸 `personNames`를 더한다. 남의 사건·없는 사건은 `404`, `matterId`가 없으면 `400`. `points`는 인용 검증을 통과하고 출처가 응답 목록에 있는 문단뿐이다. 동의가 없으면 `409 CONSENT_REQUIRED`.
- **기업 조사** `POST /matters/company` `{ name (2~60자), matterId, isBusiness?, urls? (공개 http(s) 주소 4개까지), pasted? (6,000자 이하), personNames?, consent? }` → `{ report: { overview, products[], business, items[], basics[], unknowns[] } | null, sources: { title, url }[], found: { title, url }[], unread: string[], official: { places, corps, blogs }, links, ai, notice, sourceNotice }`. Opus 5.5 + Claude 웹 검색(4회)·웹 가져오기(6회, 글 3,000토큰까지) 도구를 쓴다. `sources`는 도구가 실제로 읽은 페이지, `found`는 검색 결과에 나온 페이지, `unread`는 준 링크 가운데 읽지 못한 것(자동 접근을 막은 것으로 확인된 네이버 블로그는 도구에 넘기지 않고 바로 여기에 싣는다). 사람 이름 꼴의 이름은 `reason: "not_business"`, 상호·기관 표지가 없는데 `isBusiness: true`(사용자의 "회사·기관 이름" 확인)가 없으면 `reason: "confirm_business"`, 개인 계정 사이트 링크는 `reason: "personal_site"`로 거절한다. 모델이 이름을 사람으로 보고 거절하면 `ai: { used: false, reason: "person" }`(쓴 금액은 정산)이고, 같은 이름으로 찾은 `official`은 빈 목록, `links`는 `[]`로 돌려준다. 로마자 사람 이름 꼴("Jane Doe")은 확인이 있어도 `not_business`(회사는 Inc.·Ltd. 같은 표지를 붙여 적는다). 결과에는 공개 자료 속 대표자 이름이 `basics`의 "대표자: …" 한 항목에만 남을 수 있고, 그 밖의 항목에서 사람 이름이 보이는 문장은 서버가 뺀다(DEC-053). 사용자별 하루 횟수는 공식 API를 부르기 전에 본다. 공식 API(네이버 지역·블로그 검색, 금융위)는 상호·기관 표지가 있는 이름이면 먼저 찾아 검색 요약문을 모델에 함께 주고, 표지 없이 `isBusiness`로만 통과한 이름은 모델이 회사로 보고 조사를 마친 뒤에만 찾는다(무료 모드·예산 초과·거절이면 보내지 않고 `official`은 빈 목록, `links`는 `[]`). 붙여 넣은 글에 민감정보가 보이면 `consent: true` 없이는 `409`. 붙여 넣은 글과 검색 요약문은 위 쟁점 정리와 같은 이름 목록(`matterId`의 당사자 + `personNames`)으로 가린 뒤 보낸다. 사설·로컬 주소나 연락처가 섞인 이름은 `400`. 평가·전망 문장과 검증하지 않은 조문·사건번호가 든 문장은 결과에서 뺀다.
- **요약** `POST /matters/summarize` `{ text (6,000자 이하), matterId, personNames?, consent? }` → `{ lines: string[], ai, notice }`. 이름 목록은 쟁점 정리와 같다. 민감정보로 보이는 글은 `consent: true` 없이는 `409`. 단정·판정 표현과 검증하지 않은 조문·사건번호가 든 줄은 뺀다.
- **AI 사용량**: 네 AI 경로는 사용자별 하루 30회(`429 RATE_LIMITED`, `reason: "matter_ai_daily"`, 관리자 모드 제외)와 전체 예산을 받는다. 무료 모드·예산 초과·상한 초과·읽지 못함은 오류가 아니라 `ai: { used: false, reason }`으로 알린다. 호출별 상한(임시값): 서류 읽기 $0.008 · 요약 $0.002 · 쟁점 정리는 고른 단계의 DeepSearch 상한. 기업 조사는 건당 상한이 없고(예산에서 $1.5를 잡아 두고 웹 검색 요금을 포함한 실제 금액으로 정산, 넘으면 넘은 몫을 더 차감) 전체 예산만 받는다. 예상 밖 오류로 실제 금액을 모르면 잡아 둔 금액을 모두 쓴 것으로 정산한다.

### POST `/results/{id}/feedback`
`req { helpful: boolean; comment?: string (500자 이하) }` → `204`. 결과 소유자만(비로그인은 같은 익명 세션) — 남의 결과 `403`, 없으면 `404`.
- 결과마다 1건, 다시 보내면 덮어쓴다(`result_feedback_result_idx`).
- comment는 `scanInput`으로 마스킹한 뒤 마스킹본만 저장한다. 민감정보(건강·범죄경력)로 보이면 동의 절차가 없으므로 comment는 저장하지 않고 helpful만 저장한다(F-007 AC2).
- 레이트 리밋: IP 해시 1시간 30회(`details.reason: "write_hourly"`).

### POST `/contact` (DEC-051)
`req { topic?: "service"|"bug"|"idea"|"partner"|"other"; body: string (10~2000자); replyTo?: string (이메일) }` → `200 { status: "sent", maskedCount }` 또는 `200 { status: "not_configured"|"send_failed", maskedCount, fallback: { subject, body } }`. 누구나(anon 포함). AI를 부르지 않는다.
- body는 `scanInput`으로 가린 마스킹본만 개발자 메일로 보낸다(Resend HTTP API, `RESEND_API_KEY`). **DB에 저장하지 않고** 로그에 본문·주소를 남기지 않는다. 민감정보(건강·범죄경력)로 보이면 동의 절차가 없으므로 보내지 않고 `400 VALIDATION_ERROR`(`details.reason: "sensitive"`).
- 키가 없거나 발송이 실패하면(재시도 없음) `fallback`에 가린 제목·본문을 돌려주고, 화면은 그것으로 메일 앱 열기(mailto)를 보여 준다.
- 빈 본문 `EMPTY_INPUT`, 길이·종류·답장 주소 형식 오류 `VALIDATION_ERROR`(`details.fields`·`details.reason`). 자동 입력 칸(`website`)이 채워지면 보내지 않고 `sent`로 답한다.
- 레이트 리밋: IP 해시 1시간 5회(`details.reason: "contact_hourly"`).

### DELETE `/me/data`
- 비로그인(같은 익명 세션): 질문·결과·인용·피드백을 **바로** 지우고 `200 { status: "completed", deletedInquiries: number }`. DB 함수 `delete_anon_data`가 `audit_logs`에 `anon_data_deleted`(행위·세션 ID·시각만 — IP 해시는 남기지 않음, `20261101034525_demo_audit_no_ip.sql`)를 남긴다. 질문 횟수(`anon_sessions.questions_used`·`anon_usage`)는 남겨 **되살아나지 않는다**(DEC-018 제안). 쿠키가 없으면 지울 것이 없어 `deletedInquiries: 0`(새 세션을 만들지 않음).
- 로그인 사용자: `202 { status: "received", deletionRequestId, deletedInquiries }` — 같은 브라우저 익명 세션의 로그인 전 질문은 바로 지우고(`deletedInquiries`), 계정 기록은 `deletion_requests` 접수(운영자 처리), 처리 기한은 OQ-DM-03 (DEC-035).
- 레이트 리밋: IP 해시 1시간 30회.

### 커뮤니티 `/community/*` · GET `/me/seeds` (DEC-047)
AI를 부르지 않는다. 글은 이용자 의견이라 `AI_NOTICE` 대신 화면이 `COMMUNITY_NOTICE`를 붙인다. 규칙은 lib/community/policy.ts, 흐름은 lib/community/service.ts.

- **글쓰기** `POST /community/posts` `{ board, title, body, nickname?, password? }` → `201 { post, masked, seeds }`. `board`는 `free`·`opinion`·`whatif`·`story`·`tips`·`feedback`. 제목·본문은 `scanInput`으로 가린 마스킹본만 저장하고 `masked`는 가린 곳 수다. 비로그인은 `password`(4~32자)가 필수이고 scrypt 해시만 저장한다. 로그인 사용자는 `password`를 보내지 않으며, 씨앗을 받았으면 `seeds`가 0보다 크다.
- **목록** `GET /community/posts?board=&cursor=` → `{ items: PostSummary[], nextCursor? }` 최신순 20건. `cursor`는 앞 쪽의 `nextCursor`(작성 시각).
- **보기** `GET /community/posts/{id}` → `{ post, comments }`. `post.mine`(로그인 계정으로 쓴 내 글)·`post.needsPassword`(비로그인 글). 계정 ID·비밀번호 해시는 응답에 없다. 신고 수(`reportCount`)는 관리자 모드에만.
- **수정·삭제** `PATCH`(`{ title, body, board?, password? }`)·`DELETE`(`{ password? }`, 본문으로만). 권한이 없으면 `403 FORBIDDEN` + `details.reason` `wrong_password`(비로그인 글) 또는 `not_owner`(로그인 글). 관리자 모드는 삭제만. 글을 지우면 그 글·댓글로 받은 씨앗을 회수한다.
- **댓글** `POST /community/posts/{id}/comments` `{ body, nickname?, password? }` → `201 { comment, masked, seeds }` · `DELETE /community/comments/{id}` `{ password? }`. 댓글 수정은 없다.
- **신고** `POST /community/posts/{id}/report` → `{ reported: true }`. 누가 신고했는지 저장하지 않고, 같은 네트워크의 같은 글 신고는 하루 한 번만 센다. 신고가 5건(`REPORT_FOLD_AT`) 쌓이면 응답의 `folded`가 true가 되고 제목·본문 대신 안내 문구가 간다(관리자 모드에는 원래 내용). `DELETE /community/posts/{id}/report`는 관리자 모드만 — 신고 수를 0으로 되돌린다(`{ cleared: true }`, 아니면 `403`).
- **민감정보 동의**: 글·수정·댓글의 제목·본문이 건강·범죄경력 같은 민감정보로 보이면 `sensitiveConsent: true` 없이는 `409 CONSENT_REQUIRED` + `details { kind: "sensitive_info", categories }`를 주고 저장하지 않는다. 동의하면 시각·종류만 남긴다(F-007 AC2).
- **씨앗** `GET /me/seeds` → `{ balance, today: { posts, postsLimit, comments, commentsLimit } }`. 비로그인 `401`. 씨앗은 활동 기록이고 돈·할인 값이 없다(DEC-055).
- 입력 오류는 `400 VALIDATION_ERROR` + `details { field, reason }`(값은 싣지 않는다). 레이트 리밋(같은 네트워크 1시간): 글쓰기 10 · 댓글 30 · 수정·삭제·신고 20 → `429 RATE_LIMITED`.

### GET `/health`
`200 | 503 { status: "ok" | "degraded", checks: { db: { ok, latencyMs }, lawApi: { ok, latencyMs, cached? } }, version: string, time, ai: { mode: "free" | "paid", key: "ok" | "missing" | "invalid" | "error" } }` — 공통 형식(`data`)으로 감싸지 않는다(업타임 감시 도구용). 둘 다 닿으면 200, 아니면 503. 비밀값·오류 문구·본문은 내보내지 않는다. 법제처 확인은 인스턴스마다 5분 캐시. `ai`는 정보용(DEC-019): Claude 키가 있고 유효한지를 모델 정보 조회(토큰을 쓰지 않아 과금 없음)로만 확인하고 5분 캐시하며, 200/503 판정에는 넣지 않는다. `cache-control: no-store`. 운영 문서: `docs/reports/2026-11-01_운영_모니터링.md`.

### GET `/admin/procedure-labels` · PATCH `/admin/procedure-labels/{id}` (DEC-037)
관리자 모드 쿠키(`hz_admin`, DEC-024)가 없으면 `403 FORBIDDEN`. 라벨에는 질문 문장·개인정보가 없다.
```ts
// GET 200
{ id: string; title: string; keywords: string[]; track: string | null;
  steps: { label: string; difficulty: "self"|"depends"|"expert"; prepare: string[]; cautions: string[] }[] | null;
  status: "pending" | "approved" | "rejected"; hits: number; createdAt: string }[]
// PATCH 요청 { status: "approved" | "rejected" | "pending" } → 200 바뀐 라벨
```
단계가 없는 "절차 미정" 라벨을 승인하면 `409 INVALID_STATE`(`details.reason: "no_steps"`). 없는 라벨은 `404`.

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

## 5. 문서 작성 · (폐기된) Phase 2 엔드포인트
> DEC-055: 문서 작성 두 경로는 게이트 없이 열려 있다. 아래 표의 F-008~F-012 경로는 폐기 — 만들지 않는다.
PRD의 법률 게이트는 F-010~F-012(`lawyer_verification`·`brief_posting`·`proposals`)다. `consult_agent`(F-008, OQ-003 검토 대상)와 `procedure_guide`(F-014)는 같은 `feature_gates` 테이블로 켜고 끄는 **Phase 2 출시 플래그**로 쓴다.

| 메서드 · 경로 | 인증 | 설명 | 게이트 키 | F-ID |
|---|---|---|---|---|
| GET `/procedures?caseType=` | user | 절차 단계·기간·난이도 라벨 | `procedure_guide` | F-014 |
| POST `/documents/{kind}` (`demand-letter`·`lease-registration`·`payment-order`·`complaint`·`criminal-complaint`·`compensation-order`·`wage-petition`·`wage-advance`·`dismissal-remedy`·`dismissal-review`·`lease-mediation`·`civil-mediation`·`financial-mediation`·`property-disclosure`) | anon·user | 단계별 공식 서식 14종(lib/documents/README.md 표) 양식 채우기(템플릿, LLM 없음, 저장 안 함). 화면은 같은 `fillDocument`를 브라우저에서 실행하고 HWPX·DOCX·PDF도 브라우저에서 만들어 이 API를 쓰지 않는다 | — (DEC-055) | F-013 (DEC-022·025) |
| POST `/documents/{kind}/draft` | 질문 소유자 | 초안 도우미(무료 AI 대리 작성): 질문 마스킹본으로 규칙 칸 + Haiku 사실관계·법적 근거 초안(1건 $0.0015, 저장 안 함) | — (DEC-055) | DEC-023·055 |
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
// POST /documents/{kind} (DEC-022) — DEC-055로 게이트 없음
// req: 문서마다 정해진 문자열 필드(lib/documents/policy DOCUMENT_SPECS). 칸 형식: text(한 줄)·textarea·date(YYYY-MM-DD)·money(숫자, 쉼표·"원" 허용)·rate(연 %)·choice(정해진 값)·checks(정해진 값 쉼표 목록).
// when 조건이 맞지 않는 칸(예: 이율을 비우면 이자 시작일)은 묻지 않고 비운다. 빈 칸·형식 오류 → 400 VALIDATION_ERROR(details.fields, 값은 넣지 않음). 모르는 kind → 404
{ data: { kind: DocumentKind; title: string; basename: string; blocks: { kind: "title"|"heading"|"text"|"center"|"right"|"blank"; text: string }[]; text: string; filename: string; notice: string } }  // Cache-Control: no-store, 입력·결과 저장·로그 없음

// POST /documents/{kind}/draft (DEC-023) — DEC-055로 게이트 없음. 이름·주소·금액은 받지 않는다
// req: { inquiryId: string }  없으면 400 VALIDATION_ERROR(fields: ["inquiryId"]) · 남의 질문 403 · 없는 질문 404 · 분석 전 409 INVALID_STATE · 1시간 10회 넘으면 429
{ data: {
    kind: DocumentKind;                      // lib/procedure/steps DocumentKind
    suggestions: Record<string, string>;   // 채울 칸 키 → 값. 소장 caseName·evidence·claimCause, 내용증명 subject·facts, 임차권등기명령 extraReason, 지급명령 claimCause, 고소장 damageDetail, 배상명령 claimContent, 진정서 petitionDetail, 구제신청 reason, 재심 reviewReason, 임대차·금융 분쟁조정 reason, 민사 조정 cause. 사실관계 칸이 없는 서식(간이대지급금·재산명시)은 모델을 부르지 않고 ai.reason "no_facts". 없는 칸은 빠진다
    missing: string[];                       // 더 적으면 좋은 사실(숫자 없는 짧은 질문, 최대 4개)
    ai: { used: true } | { used: false; reason: "free_mode"|"daily_limit"|"cost_cap"|"model_failed"|"no_facts" };
    notice: string | null;                   // AI 문장이 들어가면 AI_NOTICE
    // reason "daily_limit" = 전체 유료 상한(DEC-026 주간 금액, DEC-031 기본 $80)에 닿음. 이름은 호환 때문에 그대로 둔다
} }  // Cache-Control: no-store, 저장·로그 없음

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
| ~~OQ-API-06~~ | ✅ 데모 해결(DEC-017 제안값): 판례 검색은 질문 3회와 별개, IP 해시 1시간 상한 | 인증 | DEC-005, DEC-017 |
| OQ-API-08 | 비로그인 "가벼운 답변"의 범위: 판례 몇 건까지, 법령 상세·원문 링크 포함 여부, 결과 저장 여부. 데모는 로그인 사용자와 같은 결과를 저장까지 함(DEC-010·011), 데모 뒤 재검토 | analyze 응답 | DEC-005 |
| OQ-API-09 | Google 외에 지원할 소셜 로그인(카카오·네이버 등) | 인증 | DEC-005 |
| OQ-API-07 | 관리자 작업(게이트 변경)에 2단계 승인을 둘지 | admin | F-013 |

### GET `/assistants/{id}/archive` (DEC-057)
전문 에이전트 아카이브(미리 만든 질답 세트). `id`는 `home`·`report`·`market`, 그 밖은 `404 NOT_FOUND`. 인증 없음, 모델·DB 호출 없음 — 저장소의 `lib/assistants/archive-data/{id}.json`을 돌려준다.
```ts
{ items: {
    id: string; assistant: "home"|"report"|"market"; side: "plaintiff"|"defendant";
    stage: "organize"|"notice_send"|"notice_receive"|"complaint_write"|"complaint_receive";
    title: string; question: string;            // 가상 사연
    result: DemoAnalysisResult;                 // DeepSearch 결과(검증된 문단·deep 시각자료). 체험하기는 이 결과를 재생한다
    situation: string; steps: { now: string; next: string[] };
    civil: { points: CheckedPoint[]; note: string | null };     // 인용 검증을 통과한 문단만
    criminal: { points: CheckedPoint[]; note: string | null };
    evidence: { item: string; why: string; status: "있음"|"확인 필요" }[];
    document: { title: string; steps: string[] };
    meta: { model: string; effort: string; promptVersion: string; costUsd: number; generatedAt: string };
  }[] }
```
