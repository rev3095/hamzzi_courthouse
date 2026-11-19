# lib/ai — AI 오케스트레이터 (F-002, F-006, F-008)

마스킹본만 LLM에 전달. 숫자 생성·DB 밖 인용·결과 단정 금지.

## 데모 분석 (PRD 8.2 데모 파이프라인, DEC-009·011·013·014)

분석 과정·검색 폭은 참고 프로토타입(Lee-Soyeon/legal-precedent-prototype)과 같게 맞췄다 (DEC-014). 절대 규칙 관련 차이(검증 실패 문단 제거·PII 가림·고정 AI 고지·단정/숫자 거르기)는 유지한다.

라우트는 `runDemoAnalysis({ maskedText, context }, { onStep })` 하나만 부른다. 결과는 **검증 전 초안**(`DemoDraft`)과 그 요청의 `EvidenceSet`이다. 원문 구절 대조·`verify_citations` 재조회는 lib/citations(P4)가, 저장·SSE는 analyze 라우트(P5)가 한다. `evidence`는 요청 메모리에서만 쓰고 저장하지 않는다 (DEC-007).

```
① 의도 분석   Haiku 5.5 (effort low, 구조화 출력) → 분야·알고 싶은 것·관련 법률(≤2)·조문 키워드(≤4)·판례 검색어(≤3)
② 1차 검색    법률마다 전문에서 키워드 점수(제목 3·본문 2) 상위 3개(합계 5) + 판례 검색어마다 6건(판례명+본문) → 상세 8건 (동시)
③ 재검색      Opus 5.5 (effort low, strict 도구 search_law_articles·search_precedents, 최대 3라운드·라운드당 3회)
④ 답변        Opus 5.5 (effort medium, 구조화 출력 — 출처는 근거 키 enum)
→ screenPoints로 1차 거르기 → DemoDraft
```

| 파일                                                 | 책임                                                                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.ts`                                          | 순수 규칙: 모델·한도, 출력 스키마(zod 검증), 이어 묻기 맥락(최근 3개), 검색어 PII 재검사 `safeQuery`, 문단 거르기 `screenPoints`·의도 거르기 `screenIntent`, 초안 조립                |
| `prompts.ts`                                         | 고정 시스템 프롬프트·도구 정의, `PROMPT_VERSION`. 요청마다 바뀌는 값을 넣지 않는다 (프롬프트 캐시)                                                                                    |
| `client.ts` (server-only)                            | SDK 호출 래퍼 `callModel`: 시간 한도, 거절·시간 초과·오류 → `MODEL_FAILED`/`TIMEOUT`(details는 stage·status·reason만). SDK 로그 끔. Opus 호출에 서버 fallback(`fallbacks: "default"`) |
| `message.ts`                                         | 사용자 메시지 조립 (이전 대화는 맥락으로만)                                                                                                                                           |
| `intent.ts` · `gather.ts` · `agent.ts` · `answer.ts` | ①·②③ 도구 실행·③·④ 단계                                                                                                                                                               |
| `orchestrator.ts` (server-only)                      | 전체 흐름·시간 예산(기본 100초: 답변 몫 30초·검증 몫 4초를 남기고, 모자라면 재검색을 줄인다)·진행 단계 `onStep`                                                                       |

### 거르기 규칙 (`screenPoints`, 절대 규칙 1·2·3)

- 출처가 `citableKeys`(조문, 판시사항·요지를 가져온 판례)가 아니면 뺀다.
- 본문에 적힌 사건번호·조문번호가 근거(또는 근거 원문에 적힌 조문)에 없으면 뺀다. P4는 source·quote만 대조하므로 본문 속 인용은 여기서 막는다.
- 단정 표현(`isAssertive`, NFKC 정규화 후)이 있으면 뺀다.
- 숫자는 단위까지 토큰으로 비교해 그 문단 출처 원문에 같은 토큰이 있어야 한다. 한글 수사("삼 년", "열흘")·전각 숫자도 본다. 조문·사건번호·날짜 속 숫자는 숫자 검사에서 빼고 인용 검사로 본다.
- 의도 요약도 단정 표현·질문에 없는 숫자가 있으면 비우고, 관련 법률은 근거로 가져온 법령명만 남긴다.

### 답변 1회 분석 — 사용자가 고른 단계 (DEC-020·026·036)

`lite.ts` `runLiteAnalysis`: 질문 해석 1회(DEC-033, 아래) → 무료 법제처 검색(`lib/demo` `freeSearch`) → 근거를 조문 6·판례 3건, 600·800자로 줄여 답변 1회(`LITE_ANSWER_SYSTEM`, 문단 3~4개) → 라우트가 무료 인용 검증. 세 단계 모두 흐름은 같고 답변 모델·생각 설정·출력 한도만 다르다(아래 표).

- **질문 해석 (DEC-033)**: 검색 전에 `UNDERSTAND_MODEL`(Haiku 5.5, 답변 모델과 무관)을 1회 불러 절차 섹션 라벨과 검색어를 뽑는다(`UNDERSTAND_SYSTEM`·`UNDERSTAND_SCHEMA`, 출력 `UNDERSTAND_TOKENS` 300 이하, thinking 끔). `screenUnderstanding`이 가림 표시·개인정보 모양·길이를 걸러 통과한 검색어만 `freeSearch`에 넘긴다(`lawQuery` → 법령 검색 문장, `caseQueries` → 판례 검색어 맨 앞). 라벨은 `lib/procedure/sections.ts` 목록의 값만 `draft.section`에 싣는다. 답변과 같은 `withCostCap` 하나를 쓰므로 질문 1건 상한은 그대로다. 상한·시간 초과·형식 오류·모델 오류는 모두 해석 없이 계속한다(재시도 없음).

- 단계는 분석 요청 본문의 `tier`로 온다(질문창 슬라이더, 이 기기에만 기억). 없으면 Pro. 설정은 `models.ts` `TIERS` 한 표에 있다 (DEC-036). 서버 환경변수로 모델을 정하던 `AI_ANSWER_MODEL`·`AI_MODE=pro`는 폐기했다.

| 단계 | 모델 | 생각 | 출력 한도 | 질문 1건 상한 | 주간 예산 단위 | 실측 |
|---|---|---|---|---|---|---|
| Light | `claude-haiku-5-5` | `disabled` | 1,200 | $0.0015 | 1 | 약 $0.0009, 6~7초 (2026-11-18, 2건) |
| Pro (기본) | `claude-sonnet-5-5` | `between_tools` (effort high 이하에서만 허용) | 1,200 | **$0.03** | 20 | 약 $0.020, 8~11초 (2026-11-18, 2건) |
| Pro Max | `claude-opus-5-5` | 끌 수 없음 — `adaptive` + effort medium | 5,000 (생각 + 답변) | **$0.15** | 100 | 없음 (상한, 실호출 전) |

- Opus 5.5는 생각을 끌 수 없다(보내면 400). `max_tokens`가 생각 토큰까지 묶으므로 상한은 지켜지지만, 생각이 한도를 다 쓰면 답변이 잘려 AI 문단 없이 근거만 나갈 수 있다(쓴 비용은 청구됨). 실측 뒤 한도를 다시 정한다.
- 전체 상한은 **주간 금액 하나**다 (lib/auth/rate-limit `tryAiQuota(가중치)`; 하루 상한 없음): `AI_WEEKLY_BUDGET_USD` 기본 **$80**(DEC-031 공모전 임시값). 단계가 섞여도 금액이 맞도록 건수가 아니라 단위($0.0015, `BUDGET_UNIT_USD`)로 센다 — $80 = 53,333단위, DB 함수 `hit_rate_limit_weighted`(마이그레이션 `20261118143933`). **적용 전에는 유료 분석이 오류가 난다.** 주간 창(토 09:00 KST 시작)이 결제 주기와 어긋나면 한 주기에 $100을 넘을 수 있다(넘는 몫은 구매 크레딧). 예시 질문 재생은 세지 않는다.
- **기간 예산 (DEC-040)**: 2026-11-25 24시(한국 시간)까지는 주간 창 대신 기간 하나($95, `AI_PERIOD_BUDGET_USD`)로 세고 실제로 쓴 금액만 차감한다. `tryAiQuota(가중치)`가 그 호출의 상한을 먼저 잡아 두고, 호출이 끝나면 `settleAiQuota(가중치, spentUsd)`로 차액을 돌려준다. 남은 금액이 단계 상한보다 적으면 무료 모드.
- 주간 카운터 행이 지워지지 않게 파기 배치의 `rate_limit_hits` 보유 기간은 8일이다 (마이그레이션 `20261117160154_ai_weekly_quota_retention.sql`).
- 비교 근거: `docs/reports/2026-11-18_Haiku_Sonnet_Opus_답변_비교.md`.

- 호출 전 무과금 토큰 세기로 입력을 재고, 넘으면 근거를 뒤에서부터 하나씩 빼고 다시 잰다. 하나도 못 넣으면 Claude를 부르지 않는다.
- 출력 한도 초과·형식 오류는 오류로 끝내지 않고 AI 문단 없이 근거만 낸다(`costCapped`). SDK 재시도 0.
- 실측(2026-11-15, count_tokens): 한국어 1글자 ≈ 1토큰, 답변 지시문 약 1,500토큰. 예산: 입력 약 9,000($0.0009) + 출력 1,200($0.0006). 출력 최소 700토큰을 못 남기면 근거를 뺀다.
- 테스트: `tests/unit/ai-lite.test.ts` (가짜 모델). 유료 확인은 필요할 때 1~2번만 (CLAUDE.md 절대 규칙 8).

### 문서 초안 도우미 (DEC-023, legal_documents 게이트 뒤)

`doc-draft.ts` `draftFacts`: 질문 마스킹본만 받아 Haiku 1회로 "있었던 일" 문장(최대 8개)과 더 적을 내용(최대 4개)을 JSON으로 받는다. 1건 **$0.0015** 상한(`DOC_DRAFT_COST_CAP_USD`, 출력 900토큰). 문장 거르기는 `lib/documents/draft.ts` `screenFacts`(사연에 없는 숫자·가림 표시, 단정 표현, 법률 판단 낱말, 법령·판례 언급이면 뺌). 예산 초과·모델 실패·남은 문장 없음은 오류가 아니라 `ok: false`로 끝내고 재시도하지 않는다. 테스트: `tests/unit/doc-draft.test.ts`.

### 절차 분류 (DEC-037)

`classify.ts` `classifyProcedure`: 규칙이 절차를 정하지 못했고 저장된 라벨에도 없는 질문에만 Haiku 1회(생각 끔, 출력 900토큰, **$0.0015** 상한, 주간 예산 1단위). 기존 타임라인 키 또는 `none`, 질문에 있는 일반 낱말, (없을 때만) 단계 초안을 구조화 출력으로 받는다. 검사·저장·승인은 `lib/procedure/labels.ts`·`labels-store.ts`, 호출 순서는 `lib/inquiries/procedure-hint.ts`. 실패는 오류가 아니라 "분류 없음"이다. 테스트: `tests/unit/ai-classify.test.ts`, `tests/unit/procedure-labels.test.ts`.

### 비용 상한 — 전체 파이프라인 (DEC-019, 지금은 분석 경로에서 쓰지 않음 — DEC-036)

`cost.ts`(순수 규칙)와 `client.ts` `withCostCap`이 질문 1건의 Claude 호출 합계를 **$0.015** 안으로 묶는다. 모든 단계 Haiku 5.5, thinking 끔.

| 단계                  | 출력 한도 | 이보다 적게 쓸 수 있으면                | 비고                  |
| --------------------- | --------- | --------------------------------------- | --------------------- |
| ① 의도                | 1,000     | 600 → 오류                              | effort low            |
| ③ 재검색 (라운드마다) | 1,500     | 800 → 라운드 중단                       | 답변 몫 $0.005를 남김 |
| ④ 답변                | 6,000     | 2,500 → 답변 없이 근거만 (`costCapped`) | effort medium         |

- 단가(USD/1M): 입력 0.10 · 출력 0.50 · 캐시 읽기 0.01 · 캐시 쓰기 0.125. 프롬프트 100K 토큰 이상은 장문 단가라 요청하지 않는다.
- 호출 전: `countTokens`(무과금)로 입력을 재고, 실패하면 글자 수 × 1.5로 넉넉히 잡는다. (쓴 비용 + 입력 정가 + 출력 한도) > 상한이면 부르지 않고, 남은 예산에 맞춰 `max_tokens`를 줄인다.
- 호출 후: `usage`(입력·출력·캐시 읽기·쓰기)로 실제 비용을 누적한다. 결과의 `costUsd`는 단가표로 계산한 값이다.
- 키 점검: `key-check.ts` — 세 단계 모델의 정보 조회만(무과금), `/api/v1/health`의 `ai.key`.

### 테스트·비용

- 단위: `lib/ai/policy.test.ts`, `lib/ai/cost.test.ts`, `tests/unit/ai-orchestrator.test.ts` (모델·법제처를 가짜로).
- 실호출: `tests/live/ai.live.test.ts` (`pnpm test:live`, `ANTHROPIC_API_KEY` 필요). 질문 1건 약 40~50초, 입력 3만~6만 토큰 · 출력 약 4천 토큰 (2026-10-21 측정, Opus 5.5 기준 약 0.2~0.3달러). 비용 줄이기(근거 요약 길이, 재검색 effort)는 P9 평가셋으로 비교해 정한다.
