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
- 같은 날 이어진 요청: ① 색은 빼지 않고 **연한 포인트**로 입힌다 — 머리 쪽 옅은 물듦(`--hza-tint`), 아이콘 테두리, 고른 탭·버튼(`--hza-strong`), 말풍선 옆줄·단계 번호(`--hza-accent`). ② 질문 예는 비서 페이지에서 질문창 **아래**에 둔다(챗봇 창은 대화 칸 안). ③ 비서 페이지 질문창에 **사진·문서 붙이기** — 새 AI 경로가 아니라 자료 첨부(F-017, `useMaterialsAsk` → `MaterialsFlow`: 동의 두 항목 → 읽기 → 확인)를 그대로 쓰고, 질문이 준비되면 `onReady`가 비서 분석으로 잇는다(읽기 호출의 횟수·금액 상한은 그 경로의 서버 규칙). ④ 셋째 탭 **진행 과정**(`ProgressTab`): 그 비서의 `sections`에 해당하는 절차 타임라인(lib/procedure `TRACKS`·`LIFE_TRACKS` 고정 문안)을 **일반 답변과 같은 부품**(`components/result/ProcedureTimeline` — 번호 마일스톤, 커서·누르기 팝업, '이 단계 서식 작성하기', '이 단계 질문하기')으로 보이고, 아래에 서식 작성 바로 가기와 접어 둔 표를 둔다. 모델 없음, 숫자·판정 없음, `PROCEDURE_NOTICE` 표시. 이 탭에서 나눈 마지막 질문 번호(`loadThread`)를 `/documents/{kind}?from=`으로 넘겨 초안 도우미(DEC-023)를 쓸 수 있게 한다. 서식은 `step.document`가 있는 단계에만 붙는다 — 서식이 없는 분야(고소미의 명예훼손·성범죄 등)에 다른 분야 서식(고소장(사기) 등)을 대신 잇지 않는다.
- **진행 과정의 갈래** (`paths.ts`, 사용자 요청 2026-11-26): 고소미·중고천국은 '진행 과정' 탭에서 입장(고소·청구하는 쪽 / 받은 쪽)과 절차(형사 / 민사)를 먼저 고르고, 갈래마다 다른 타임라인을 본다. 형사에는 원고·피고가 없어 화면 이름을 이렇게 쓰고 갈래 설명(`PATH_LEAD`)에서 고소인·피의자·원고·피고를 알려 준다. 하는 쪽 갈래는 lib/procedure 고정 문안에서 형사 단계·민사 단계를 나눠 쓰고, 받은 쪽 갈래(고소당했을 때 / 소장·지급명령을 받았을 때)는 `paths.ts`에 새로 쓴 고정 문안이다 — 기간은 숫자 없이 '받은 서류에 적힌 기간'으로만 말하고, 고소당한 쪽에는 진술거부권·변호인 조력을 알린다. 문안 검사는 `paths.test.ts`. 내집마련은 갈래 없이 분야별 타임라인만 본다. 갈래별 서식(DEC-066): 하는 쪽 형사 = 간이고소장(모욕·명예훼손)·고소장(통신매체이용음란) / 고소장(중고거래 사기)·간이고소장(사기)·배상명령, 하는 쪽 민사 = 내용증명·지급명령·소장, 받은 쪽 민사 = 답변서·지급명령 이의신청서·이행권고결정 이의신청서. 받은 쪽 형사 = 합의서·고소취소장(둘 다 피해자·고소인이 서명하는 문서 — 고소당한 사람이 준비만 할 수 있다). 단계에 붙지 않는 서식은 갈래의 `forms`에 둔다.
- 실존 확인(무료 법제처 조회): `tests/live/assistant-cases.live.test.ts` — 사례 판례의 사건번호·법원·선고일, 고정 조문·사례 관련 조문.
- 새 사례는 공개 판례(법제처)나 직접 쓴 가상 사례만 쓴다. 실제 사용자 질문·민간 상담 글은 쓰지 않는다. 판결문 속 이름·주소·금액·대화명은 옮기지 않는다.

## 여러 파일에 걸친 규칙 (CLAUDE.md에서 옮김, 2026-11-25)

- 분야별 비서(F-018, DEC-057, lib/assistants README): 내집마련·고소미·중고천국. 화면 이름은 '전문 에이전트'. 새 AI 경로가 아니라 analyze 본문 `assistant`로 라이트 답변에 비서 지시문(두 번째 시스템 블록)·고정 조문·사례 판례(그 요청에서 법제처 재조회)를 더할 뿐이고, 답변 단계는 Pro Max(지금 Opus 5.5 effort high, DEC-050) 고정 + Haiku 대화 한마디(lib/assistants/talk.ts `screenTalk`로 숫자·법령·판정을 거른다). 설정은 lib/assistants/run-config.ts 한 곳(실호출 테스트 `tests/live/assistants.live.test.ts`도 같은 것, 유료·`ASSISTANT_LIVE=1`). 에이전트 페이지의 '아카이브' 탭은 미리 만든 질답 세트(에이전트마다 10개, 원고 7 : 피고 3, 시나리오 lib/assistants/archive-scenarios.ts)이고 데이터는 저장소 `lib/assistants/archive-data/*.json`(운영 DB에 쓰지 않는다) — 만들기는 `tests/live/assistant-archive.live.test.ts`(유료, `ARCHIVE_GEN=1`, lib/ai/archive.ts: DeepSearch Pro Max + 정리 한 번, 민사·형사 문단도 verifyDraft, 근거 없는 정리 문장은 `guideLineOk`). 아카이브 질문은 `findExample`이 저장된 답을 재생한다(DEC-027과 같은 취급) — 대화 한 턴 = 질문 1건(이어 묻기), 횟수·비용 상한·인용 검증·개인정보 가림은 일반 질문과 같다. 화면은 `/assistants`·`/assistants/[id]`(components/assistants, 스킨은 `assistants.css`의 `hza-`·`data-hza`, 비서마다 색·배치가 다르다 — Figma 밖 예외)와 홈 아래 카드·푸터 바로 가기·안내 챗봇 비서 모드. 사례 문안은 숫자·단정·개인정보 금지(policy.test.ts), 실존은 `tests/live/assistant-cases.live.test.ts`(무료).
