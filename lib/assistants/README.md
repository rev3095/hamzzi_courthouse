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
- 화면: `components/assistants/` — `AssistantChat`(대화, 비서 페이지·안내 챗봇 비서 모드 공용), `AssistantPage`(세 비서 공통 배치), `AssistantCards`(홈·목록 카드), 스킨은 `assistants.css`(`hza-` 접두어, `data-hza`로 색을 바꾼다).
- 화면 구성 (2026-11-26 사용자 요청 — 아래 옮겨 온 규칙의 "비서마다 색·배치가 다르다"를 대신한다): 세 비서는 **같은 배치에 색조만 다르다**. 한 화면에 머리(이름·한 줄) → 탭(대화하기 | 미리 만든 질답) → 대화 → 접어 둔 도움말 → 접어 둔 사례 순이고, 도움말·사례·아카이브 세트는 처음에 제목만 보인다. 색은 연한 바탕에 진한 글자(고소미도 밝은 바탕 — 어두운 남색 바탕·깎은 모서리·두꺼운 테두리·어긋난 그림자는 쓰지 않는다), 글줄 간격은 본문 1.75 안팎. 색을 바꾸면 본문·보조 글자 대비 4.5:1을 다시 계산한다. AI가 쓴 내용이 보이는 자리(아카이브의 '지금 상황', 답변)에는 그 자리에 `AI_NOTICE`를 둔다.
- 실존 확인(무료 법제처 조회): `tests/live/assistant-cases.live.test.ts` — 사례 판례의 사건번호·법원·선고일, 고정 조문·사례 관련 조문.
- 새 사례는 공개 판례(법제처)나 직접 쓴 가상 사례만 쓴다. 실제 사용자 질문·민간 상담 글은 쓰지 않는다. 판결문 속 이름·주소·금액·대화명은 옮기지 않는다.

## 여러 파일에 걸친 규칙 (CLAUDE.md에서 옮김, 2026-11-25)

- 분야별 비서(F-018, DEC-057, lib/assistants README): 내집마련·고소미·중고천국. 화면 이름은 '전문 에이전트'. 새 AI 경로가 아니라 analyze 본문 `assistant`로 라이트 답변에 비서 지시문(두 번째 시스템 블록)·고정 조문·사례 판례(그 요청에서 법제처 재조회)를 더할 뿐이고, 답변 단계는 Pro Max(지금 Opus 5.5 effort high, DEC-050) 고정 + Haiku 대화 한마디(lib/assistants/talk.ts `screenTalk`로 숫자·법령·판정을 거른다). 설정은 lib/assistants/run-config.ts 한 곳(실호출 테스트 `tests/live/assistants.live.test.ts`도 같은 것, 유료·`ASSISTANT_LIVE=1`). 에이전트 페이지의 '아카이브' 탭은 미리 만든 질답 세트(에이전트마다 10개, 원고 7 : 피고 3, 시나리오 lib/assistants/archive-scenarios.ts)이고 데이터는 저장소 `lib/assistants/archive-data/*.json`(운영 DB에 쓰지 않는다) — 만들기는 `tests/live/assistant-archive.live.test.ts`(유료, `ARCHIVE_GEN=1`, lib/ai/archive.ts: DeepSearch Pro Max + 정리 한 번, 민사·형사 문단도 verifyDraft, 근거 없는 정리 문장은 `guideLineOk`). 아카이브 질문은 `findExample`이 저장된 답을 재생한다(DEC-027과 같은 취급) — 대화 한 턴 = 질문 1건(이어 묻기), 횟수·비용 상한·인용 검증·개인정보 가림은 일반 질문과 같다. 화면은 `/assistants`·`/assistants/[id]`(components/assistants, 스킨은 `assistants.css`의 `hza-`·`data-hza`, 비서마다 색·배치가 다르다 — Figma 밖 예외)와 홈 가이드 아래 카드·헤더 ☰ 메뉴·안내 챗봇 비서 모드. 사례 문안은 숫자·단정·개인정보 금지(policy.test.ts), 실존은 `tests/live/assistant-cases.live.test.ts`(무료).
