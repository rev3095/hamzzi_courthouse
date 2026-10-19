---
name: add-endpoint
description: app/api/v1 아래에 API 엔드포인트를 추가하거나 고칠 때 사용. docs/API.md의 응답 형식·에러 코드·게이트·PII 규칙을 지키게 한다.
---

# API 엔드포인트 추가

먼저 `docs/API.md`에서 해당 엔드포인트 절과 3절(에러 코드)만 읽는다. API.md에 없는 엔드포인트라면 구현하지 말고 API.md 수정안을 먼저 제안한다.

## 체크리스트
1. **위치**: `app/api/v1/<path>/route.ts`. 비즈니스 로직은 `lib/*`에 두고 라우트는 얇게.
2. **응답 형식**: 성공 `{ data, meta? }`, 실패 `{ error: { code, message, details?, requestId } }`. 에러 코드는 API.md 3절에 있는 것만 쓴다.
3. **인증·권한**: `anon` / `user` / `lawyer` / `admin` 중 표에 적힌 역할만 허용. 비로그인 1회 제한(DEC-005)이 걸린 경로는 `LOGIN_REQUIRED`.
4. **게이트**: Phase 2 엔드포인트는 맨 처음에 `lib/gate`로 검사하고, 승인 전이면 `403 FEATURE_GATED`.
5. **PII**: 사용자 입력은 `lib/pii`를 거친다. 원문을 DB·로그·에러 메시지에 남기지 않는다(DEC-006).
6. **AI 결과**: `aiNotice` 포함, 인용은 `lib/citations` 검증을 통과한 것만, 숫자는 `lib/calc` 결과만.
7. **"결과 없음"은 에러가 아니다**: `200` + `outcome: "no_result_in_scope"`.

## 테스트
- 수용 기준(PRD의 해당 F-ID AC)마다 테스트 하나. 이름에 ID를 넣는다: `F-003 AC2 결과 없음 안내`.
- 에러 코드 경로(권한 없음, 게이트 차단, 빈 입력)를 최소 하나씩 테스트한다.
- 실행: `pnpm test`
