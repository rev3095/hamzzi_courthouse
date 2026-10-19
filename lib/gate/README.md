# lib/gate — 기능 게이트 (F-013)

feature_gates 상태가 approved가 아니면 FEATURE_GATED. 클라이언트 플래그로 판단하지 않는다. 설계: docs/ARCHITECTURE.md 3절

| 파일        | 역할                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `policy.ts` | 순수 규칙: `isOpen`(approved만, 행 없으면 거부), `assertOpen`, 승인 조건 검사 `planChange`, 본문 검증        |
| `store.ts`  | server-only. `requireFeature(key)` — Phase 2 엔드포인트 맨 앞에서 호출. 변경은 DB 함수 `change_feature_gate` |
| `view.ts`   | 관리자 응답 형태(`unresolved` = 미완료 검토 항목)                                                            |

승인 조건(검토 기록 + 조건 전부 해결)은 앱과 DB 함수가 둘 다 검사한다.
