# lib/search — 하이브리드 검색 (F-003, F-004, F-006)
키워드 + 벡터 → 재정렬 → 유사도 임계값 판단.

## 필수 필터 (F-007, DATA_MODEL 2절)
- 판례(`court_cases`, `case_chunks`, `case_statute_refs`)는 **`deid_check = 'passed'`인 행만** 검색·반환한다. `pending`·`flagged`는 제외한다.
- 서버 검색은 service_role로 실행되어 RLS를 우회한다. 그래서 이 필터를 RLS에 맡기지 말고 **모든 검색 쿼리에 직접 건다**.
- 검색 테스트에 `pending`·`flagged` 판례가 결과에 나오지 않는 케이스를 넣는다.
