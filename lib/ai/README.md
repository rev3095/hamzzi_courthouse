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

### 테스트·비용

- 단위: `lib/ai/policy.test.ts`, `tests/unit/ai-orchestrator.test.ts` (모델·법제처를 가짜로).
- 실호출: `tests/live/ai.live.test.ts` (`pnpm test:live`, `ANTHROPIC_API_KEY` 필요). 질문 1건 약 40~50초, 입력 3만~6만 토큰 · 출력 약 4천 토큰 (2026-10-21 측정, Opus 5.5 기준 약 0.2~0.3달러). 비용 줄이기(근거 요약 길이, 재검색 effort)는 P9 평가셋으로 비교해 정한다.
