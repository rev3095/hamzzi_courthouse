# lib/documents — 내용증명·소장 양식 `[게이트]` (DEC-022)

`legal_documents` 게이트(F-013)가 승인되기 전에는 **꺼져 있다**: `POST /api/v1/documents/{kind}`는 맨 앞 `requireFeature`에서 403 FEATURE_GATED, 화면 `/documents/[kind]`는 안내·작성 요령·공식 양식 링크만 보인다. OQ-003(AI 문서 범위) 해결 전 활성화 금지.

| 파일        | 역할                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `policy.ts` | `DOCUMENT_SPECS`(필드·작성 요령·공식 링크), `parseDocumentInput`(검증, 오류는 필드 이름만), `fillDocument`(양식 채우기) |

- 사용자가 적은 값을 정해진 칸에 넣기만 한다. LLM 없음, 법률 판단·금액·이자·새 문장을 만들지 않는다.
- 입력에 이름·주소가 들어가므로 저장하지 않고 로그에도 남기지 않는다(`withRoute`는 본문을 기록하지 않음). 응답은 `no-store`.
- AI 생성물이 아니어서 `AI_NOTICE` 대신 `DOCUMENT_NOTICE`를 붙인다.
