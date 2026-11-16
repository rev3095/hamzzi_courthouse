# lib/documents — 내용증명·소장 양식 `[게이트]` (DEC-022)

`legal_documents` 게이트(F-013)가 승인되기 전에는 **꺼져 있다**: `POST /api/v1/documents/{kind}`는 맨 앞 `requireFeature`에서 403 FEATURE_GATED, 화면 `/documents/[kind]`는 안내·작성 요령·공식 양식 링크만 보인다. OQ-003(AI 문서 범위) 해결 전 활성화 금지.

| 파일        | 역할                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `policy.ts` | `DOCUMENT_SPECS`(필드·작성 요령·공식 링크), `parseDocumentInput`(검증, 오류는 필드 이름만), `fillDocument`(양식 채우기). 브라우저에서도 쓴다 — server-only를 넣지 않는다 |
| `draft.ts`  | 초안 도우미(DEC-023) 규칙: `ruleSuggestions`(사건명·제목·입증방법), `screenFacts`·`screenMissing`(모델 문장 거르기), `factsText` |

- 사용자가 적은 값을 정해진 칸에 넣기만 한다. LLM 없음, 법률 판단·금액·이자·새 문장을 만들지 않는다.
- 입력에 이름·주소가 들어가므로 저장하지 않고 로그에도 남기지 않는다(`withRoute`는 본문을 기록하지 않음). 응답은 `no-store`.
- AI 생성물이 아니어서 `AI_NOTICE` 대신 `DOCUMENT_NOTICE`를 붙인다.
- **초안 도우미 (DEC-023)**: 결과 화면 '바로 가기'·'소장 작성 안내'가 `?from=<질문 번호>`로 온다. `POST /documents/{kind}/draft`는 질문 번호만 받아 그 질문 마스킹본으로 규칙 칸과 Haiku 사실관계 초안(`lib/ai/doc-draft`, $0.0015)을 돌려준다. 이름·주소·금액은 화면에서 직접 적고, 양식 채우기는 브라우저 안(`components/documents/DocumentForm.tsx`)에서 한다. 1회용 — 쿠키·localStorage·서버에 저장하지 않는다. AI 문장이 들어가면 `AI_NOTICE` + `DRAFT_NOTICE`("초안 · 법률 검토 필요").
