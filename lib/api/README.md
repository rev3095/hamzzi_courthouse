# lib/api — API 라우트 공통 (docs/API.md 2·3·6절)

- `withRoute(handler)`: requestId 부여, `ApiError` → 표준 에러 응답, 예상 못 한 예외 → `INTERNAL_ERROR`, 요청 로그.
- `ok()` / `fail()`: `{ data, meta }` · `{ error }` 형식. AI 결과에는 `AI_NOTICE`를 붙인다.
- 로그·에러에는 입력 본문, 쿼리 문자열, 예외 메시지를 넣지 않는다 (F-007). 사용자 ID는 해시로만.
