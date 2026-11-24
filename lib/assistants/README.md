# lib/assistants — 분야별 비서 (F-018, DEC-057)

일반 질문과 같은 분석 경로(질문 해석 → 법제처 검색 → 답변 1회 → 인용 검증)에 **분야 지시문·고정 조문·사례 판례**를 더하는 순수 모듈이다. 횟수·비용 상한·개인정보 가림·검증 규칙은 바꾸지 않는다.

| 파일 | 책임 |
|---|---|
| `agents.ts` | 비서 세 명(내집마련 `home`·고소미 `report`·중고천국 `market`)의 이름·소개·다루는 섹션·고정 검색어·조문(셋까지)·지시문·질문 예·도움 판 문안 |
| `cases.ts` | 사례 자료. 공개 판례(법제처 번호·법원·선고일 + 직접 쓴 요지, 원문 저장 없음 — DEC-007)와 가상 사례(A·B, 결과 없음). `pinnedPrecedents`가 질문 낱말에 맞는 판례 번호를 골라 분석에 넘긴다 |
| `talk.ts` | 대화 한마디(Haiku) 지시문·출력 형식·거르기(`screenTalk`: 숫자·법령·판례·판정·단정·개인정보가 든 문장은 버림) |
| `run-config.ts` | 한 질문의 라이트 답변 설정(답변 단계 Pro Max 고정, 지시문·사례 판례·대화 지시문). analyze와 실호출 테스트가 같이 쓴다 |
| `archive-scenarios.ts` | 아카이브 시나리오 30개(에이전트마다 10, 원고 7 : 피고 3, 서류 단계 양쪽) — 직접 쓴 가상 사연 |
| `archive.ts` | 아카이브 세트 형식·정리 호출 출력 형식·근거 없는 정리 문장 거르기(`guideLineOk`) |
| `archive-data.ts`, `archive-data/*.json` | 만든 세트(저장소가 원본). `findArchiveItem`으로 체험하기 재생 |
| `policy.test.ts` | 문안 검사(숫자·단정·판정 표현·개인정보), 섹션 라벨, 예시 질문 재생, analyze 본문 검사 |

- 서버: `lib/inquiries/analyze.ts`가 `assistant`를 받아 `runLiteAnalysis`(lib/ai/lite.ts)에 `{ persona, pinnedCaseIds, promptTag }`를 넘긴다. 지시문은 답변 지시문 뒤 두 번째 시스템 블록이다. 지시문·질문 예를 바꾸면 `promptTag`(`assistant-{id}-v1`)를 올린다.
- 화면: `components/assistants/` — `AssistantChat`(대화, 비서 페이지·안내 챗봇 비서 모드 공용), `AssistantPage`(비서별 배치), `AssistantCards`(홈·목록 카드), 스킨은 `assistants.css`(`hza-` 접두어, `data-hza`로 색을 바꾼다).
- 실존 확인(무료 법제처 조회): `tests/live/assistant-cases.live.test.ts` — 사례 판례의 사건번호·법원·선고일, 고정 조문·사례 관련 조문.
- 새 사례는 공개 판례(법제처)나 직접 쓴 가상 사례만 쓴다. 실제 사용자 질문·민간 상담 글은 쓰지 않는다. 판결문 속 이름·주소·금액·대화명은 옮기지 않는다.
