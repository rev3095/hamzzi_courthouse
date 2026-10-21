# lib/search — 하이브리드 검색 (F-003, F-004, F-006)

키워드 + 벡터 → 재정렬 → 유사도 임계값 판단.

## 데모: korean-law-mcp 어댑터 (DEC-009)

데모는 수집 DB 대신 법제처를 실시간 조회한다. 서비스 코드에서 korean-law-mcp를 import하는 곳은 `law-source.ts` 하나뿐이다.

| 파일                          | 책임                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `law-source.ts` (server-only) | `createLawSource()` → `findArticles`(법령 전문에서 키워드 점수 — 제목 3·본문 2, 프로토타입 방식 DEC-014) · `searchArticles`(지능형 법령정보지식베이스, 자연어 → 조문, 보조) · `getArticle`(법령명 + 조문번호) · `searchCases`(판례명+본문 `both` 검색) · `getCase` · `verifyStatutes` · `verifyCases` |
| `normalize.ts`                | 법제처 응답 → 우리 타입 변환(순수 함수): 날짜, 조문번호, 조문 본문 합치기, 판례 본문 일부, 재조회 결과 해석                                                                                                                                                                                           |
| `evidence.ts`                 | `EvidenceSet` — 한 요청에서 가져온 근거 모음. 인용 검증기(F-005 AC2 ①②)가 "가져온 자료인가"·원문 구절 대조에 쓴다                                                                                                                                                                                     |
| `types.ts`                    | `ArticleHit`·`CaseHit`·`CaseDetail`·`CitationCheck` (API.md `StatuteRef`·`CaseRef`와 필드명 일치)                                                                                                                                                                                                     |

- 인증키는 `OPEN_LAW_API_KEY`. 법제처는 **등록된 IP에서만** 응답한다(배포 환경 OQ-ARC-05).
- 업스트림 실패·시간 초과는 `ApiError("SEARCH_UPSTREAM_FAILED")`. 라이브러리 오류 문구(질의·URL 포함 가능)는 버린다.
- 판례는 판시사항·판결요지만 쓴다. 둘 다 없을 때만 당사자·대리인 머리 블록을 떼고 개인정보를 가린 본문 일부를 `fromBody`로 쓴다. 판례 전문은 반환·저장하지 않는다(DEC-007, F-007).
- 국세법령정보시스템 출처 판례(법원명 없음)는 제외한다(DEC-008).
- 조문 실존 재조회는 라이브러리가 텍스트로만 결과를 주므로 인용 1건씩 호출해 머리줄(✓/✗/⌛/⚠)을 읽는다. 판정할 수 없으면 `exists: null`(확인 필요).
- 조문 링크(`law.go.kr/법령/법령명/제N조`)는 법령 페이지가 열리는 것까지 확인했고, 해당 조문 위치로 이동하는지는 미확인.
- 테스트: `pnpm test`(fixture 목, `tests/fixtures/korean-law-mcp`), 실제 호출은 `pnpm test:live`.

## 필수 필터 (F-007, DATA_MODEL 2절)

- 판례(`court_cases`, `case_chunks`, `case_statute_refs`)는 **`deid_check = 'passed'`인 행만** 검색·반환한다. `pending`·`flagged`는 제외한다.
- 서버 검색은 service_role로 실행되어 RLS를 우회한다. 그래서 이 필터를 RLS에 맡기지 말고 **모든 검색 쿼리에 직접 건다**.
- 검색 테스트에 `pending`·`flagged` 판례가 결과에 나오지 않는 케이스를 넣는다.
