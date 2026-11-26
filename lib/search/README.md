# lib/search — 하이브리드 검색 (F-003, F-004, F-006)

키워드 + 벡터 → 재정렬 → 유사도 임계값 판단.

## 데모: korean-law-mcp 어댑터 (DEC-009)

데모는 수집 DB 대신 법제처를 실시간 조회한다. 서비스 코드에서 korean-law-mcp를 import하는 곳은 `law-source.ts` 하나뿐이다.

| 파일                          | 책임                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `law-source.ts` (server-only) | `createLawSource()` → `searchLaws`(현행 법령 이름 부분 일치 목록, 법제처 순서 그대로 — 2026-11-27 법령 탭) · `findArticles`(법령 전문에서 키워드 점수 — 제목 3·본문 2, 프로토타입 방식 DEC-014) · `searchArticles`(지능형 법령정보지식베이스, 자연어 → 조문, 보조) · `getArticle`(법령명 + 조문번호) · `searchCases`(판례명+본문 `both` 검색) · `getCase` · `verifyStatutes` · `verifyCases`                                                                                       |
| `normalize.ts`                | 법제처 응답 → 우리 타입 변환(순수 함수): 날짜, 조문번호, 조문 본문 합치기, 판례 본문 일부, 재조회 결과 해석                                                                                                                                                                                                                                                                                                                                                                        |
| `evidence.ts`                 | `EvidenceSet` — 한 요청에서 가져온 근거 모음. 인용 검증기(F-005 AC2 ①②)가 "가져온 자료인가"·원문 구절 대조에 쓴다                                                                                                                                                                                                                                                                                                                                                                  |
| `browse.ts`                   | 판례·조문 직접 검색 순수 규칙 (GET /cases · /cases/{id} · /statutes/{id}, DEC-017): 검색어 검사(개인정보면 보내지 않음), 응답 조립(관련도 없음, `SEARCH_NOTICE`), 참조조문 읽기, 조문 ID(`법령명:제N조`), asOf                                                                                                                                                                                                                                                                     |
| `explore.ts`                  | 탐색 확장 순수 규칙 (DEC-029 제안): 결정문 종류·응답 조립(요지 항목만), 바로 가기(`directTarget`), 약칭 대조, 시점 조문 줄 단위 비교(`diffLines`), 신구 대조표·자치법규·연계 XML 읽기, 3단 비교 정리, 위임 문구 대조(`delegationChecks` — 판정 없음), 법령 도구 경로 검사                                                                                                                                                                                                          |
| `types.ts`                    | `ArticleHit`·`CaseHit`·`CaseDetail`·`CitationCheck` (API.md `StatuteRef`·`CaseRef`와 필드명 일치)                                                                                                                                                                                                                                                                                                                                                                                  |
| `easy/`                       | 법령 쉬운 설명 (DEC-074): `types.ts`(타입·고정 문구, 브라우저 가능) · `policy.ts`(순수 — 모델 입력 고르기 `digestArticles`, 출력 거르기 `screenEasy`, AI 없는 정리 `fallbackEasy`) · `data.ts`+`data.json`(미리 만든 설명, 보여 주기 전에 지금 조문으로 다시 거른다). 모델 호출은 `lib/ai/law-easy.ts`(Haiku 1회), 화면은 `components/search/EasyLaw.tsx`. 법령 화면 중 이 탭만 AI를 쓰고(`AI_NOTICE`), 실제 판례는 법제처 검색 결과만, AI가 만든 사례는 가상 사례로 따로 표시한다 |
| `world/`                      | 국내·해외 법령 통합 검색 (DEC-074): `types.ts`(공통 타입·나라 목록) · `catalog.ts`(직접 고른 의료기기 핵심 법령, 공식 호스트만) · `glossary.ts`(한국어 → 영어·일본어 고정 낱말표) · `source.ts`(각국 공식 공개 API 어댑터 `searchWorldLaws`·`searchWorldCases`, 출처당 6초, 저장 없음, 모델 없음)                                                                                                                                                                                  |

- `createLawSource()`는 `LawSource`(분석·검증용)와 `LawExplorer`(탐색 확장: `casesCiting`·`searchDecisions`·`getDecision`·`listVersions`·`getArticleAt`·`compareOldNew`·`getThreeTier`·`listAnnexes`·`getLawArticles`·`linkedOrdinances`·`searchOrdinances`·`getOrdinance`·`searchAdminRules`·`searchLaws`)를 함께 돌려준다. 법령명은 `resolveLaw`가 정식 이름으로 푼다(이름 대조 → 법제처 검색 응답의 공식 약칭이 입력과 같을 때만).
- 응답의 상세링크·파일 주소 중 인증키(`OC=`)가 든 `/DRF/` 주소는 쓰지 않고 공개 주소만 만든다.
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

## 여러 파일에 걸친 규칙 (CLAUDE.md에서 옮김, 2026-11-25)

- 판례·법령 탐색(DEC-029): `createLawSource()`는 `LawSource`(분석·검증)와 `LawExplorer`(결정문·연혁·시점 조문·3단 비교·신구 대조·별표·자치법규·행정규칙·법령 이름 부분 일치 검색)를 함께 돌려준다. 판례 밖 자료 16종(결정문 12 + 조약·학칙·공사공단·공공기관 규정·영문 법령)의 target·필드 이름·상세 항목은 `DECISION_DOMAINS`(explore.ts) 한 표에 있다 — 새 종류는 여기에만 더하고 실호출(`tests/live/explore.live.test.ts`)로 필드 이름을 확인한다. 순수 규칙은 lib/search/explore.ts, 화면은 `/search`(종류 탭·바로 가기)·`/research`(업무용 리서치: 목록 + 옆 미리보기 + 보관함)·`/laws/[name]`·`/decisions/[domain]/[id]`·`/ordinances/[id]`. 모두 LLM 없음 — `SEARCH_NOTICE`, 관련도·심각도·유불리 판정 없음(절대 규칙 2), 결정문은 요지 항목만(DEC-007 원칙), 인증키가 든 `/DRF/` 주소는 응답에 싣지 않는다. 검색어는 주소에 두지 않고 `sessionStorage`(`hz:sq`)로만 화면 사이에 건네며, 조회 이력·보관함(`hz:recent`·`hz:pins`)은 공개 자료의 제목·주소만 localStorage에 둔다. 공개 저장소 lexdiff(BSL 1.1)의 기능 목록만 참고했고 코드는 가져오지 않는다. 헤더는 '판례 아카이브'(DEC-054) 한 버튼으로 검색·리서치를 고르고, 두 화면은 `ArchiveSwitch`로 오가며(주소에는 `from`·`kind`만) 보관함·자료 행·인용 표기는 components/search/rows.ts를 함께 쓴다.
