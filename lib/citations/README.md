# lib/citations — 인용 검증기 (F-005)

응답 속 사건번호·조문을 DB와 대조. 불일치는 제거하거나 unverified.

## 데모 검증 (F-005 AC2, DEC-009)

`verifyDraft(draft, evidence, { onStep, screened })` — lib/ai `runDemoAnalysis`의 초안과 그 요청의 `EvidenceSet`을 받아 최종 `DemoAnalysisResult`(API.md 4.1), DB 저장용 `CitationRow[]`(`result_citations`), 실패율 `stats`(`analysis_results.citations_total/removed`)를 만든다. `screened`에는 P3 `dropped.length`를 넘겨 실패율에 포함한다.

| 단계        | 확인                                                                                  | 실패 시                                                          |
| ----------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| ① 출처      | 출처가 그 요청에서 출처로 쓸 수 있는 근거(`citableKeys`)인가                          | 문단 제거                                                        |
| ② 원문 구절 | 20~60자 구절이 원문(`EvidenceSet.sourceText`)에 글자 그대로 있는가 (NFKC·공백만 무시) | `quote_mismatch`(확인 필요), 구절은 ""로 비우고 DB에도 넣지 않음 |
| ③ 재조회    | 출처와 본문에 적힌 조문·사건번호를 `verify_citations`로 재조회                        | 부존재·판정 불가·법령 미정 모두 문단 제거                        |

- 재조회 자체가 실패하면 결과를 내지 않고 `SEARCH_UPSTREAM_FAILED`를 올린다 (F-006 AC2).
- 본문 조문의 법령명: 근거 법령명(낱말 경계 확인) → "○○법 [시행령]" 꼴 낱말 → (법령명 꼴 낱말이 없을 때만) 번호가 같은 근거 조문 하나. 「」·괄호는 벗긴다.
- `recheck.items`에는 남은 문단이 쓴(실존 확인된) 인용만 낸다. 확인되지 않은 조문·사건번호 문자열은 응답·진행 단계에 내보내지 않는다.
- `patterns.ts`: 조문(제 생략 포함)·사건번호(재심·경매·신청 부호, 병합 번호 포함) 패턴. lib/ai의 1차 거르기와 같이 쓴다. 넓게 잡을수록 안전하다(잘못 잡힌 번호는 재조회에서 걸려 문단이 빠지는 쪽으로만 틀린다).
- 실호출: `tests/live/pipeline.live.test.ts` — 분석 약 42초 + 검증 약 0.6초 (2026-10-21).
