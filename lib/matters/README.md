# lib/matters — 사건 진행 (F-016, DEC-053)

로그인 사용자(변호사 등)가 맡은 사건을 진행 순서대로 정리하는 도구. 화면은 `/matters`(components/matters).
**판단 도구가 아니라 정리 도구다** — 승패·유불리·책임 비율 같은 판정 항목을 만들지 않는다.

## 진행 순서 (화면의 탭)

1. **자료** — 서류 사진을 올려 읽는다 (`POST /matters/read`, Haiku 비전 1회). 읽은 내용은 `mergeReading`이 사건 자료에 합친다.
2. **사실관계** — 날짜순(`sortFacts`). 서류의 주장은 누가 그렇게 적었는지와 함께 담는다.
3. **구조도** — 당사자를 자리(요구하는 쪽 / 받는 쪽 / 그 밖)별로 놓고 관계를 잇는다. 사건 자료로 코드가 그린다(모델 없음).
4. **쟁점** — 살펴볼 질문. AI 정리(`POST /matters/issues`)는 DeepSearch 경로 + 인용 검증을 그대로 쓰고 검증된 문단만 붙인다.
5. **리서치** — 기업 조사(`POST /matters/company`), 법제처 판례 검색(기존 API), 찾은 글 줄이기(`POST /matters/summarize`).
6. **노트** — 찾은 내용을 계속 덧붙인다. 본문의 `[[이름]]`이 당사자·쟁점·노트와 이어진다. 판례·법령 보관함(`/research/shelf`)에서 '사건 노트로 보내기'로도 더한다(DEC-075 ⓓ — 자료 한 건 = '법령·판례' 노트 한 건, AI 아님, 같은 출처 주소는 다시 넣지 않음, components/search/to-matter.ts). 새 API 없이 `GET`·`PUT /matters/{id}`를 쓴다.

## 파일

| 파일             | 책임                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.ts`       | 사건 자료 모양(`MatterData`)과 순수 도우미(`mergeReading`·`sortFacts`·`composeIssueText`). 브라우저와 함께 쓴다                                                   |
| `policy.ts`      | 순수 규칙: 저장 검증(`MatterDataZ`·`parseMatterData`), 판독 결과 거르기(`screenMatterReading`), 모델에 보낼 글 가리기(`maskForModel`), 기업 조사 요청·결과 거르기 |
| `store.ts`       | server-only. `matters` 테이블 접근 — 모든 질의에 `user_id`를 건다. `requireMatterUser`                                                                            |
| `ai-gate.ts`     | server-only. AI 호출 공통 절차 `runMatterAi`: 사용자별 하루 횟수 → 무료 모드·예산 → 호출 → 정산                                                                   |
| `policy.test.ts` | 위 규칙의 단위 테스트                                                                                                                                             |

AI 호출은 `lib/ai/matter.ts`(서류 읽기·쟁점 정리·요약)와 `lib/ai/company.ts`(기업 조사)에 있다.

## 지키는 것

- **로그인 전용·본인만**: 비로그인은 401. 남의 사건·없는 사건은 똑같이 404.
- **가상 사건 프리셋 (DEC-061)**: 로그인 전에는 `presets.json`(`presets.ts`)의 가상 사건으로 화면을 둘러본다(`components/matters/PresetWorkspace`). 브라우저 메모리에서만 고치고 저장하지 않으며, AI 기능은 서버가 401로 막는다. 사람 이름 없이 역할·기호로만 쓴 사건이고, 쟁점 근거는 인용 검증을 통과한 문단만이다. 만들기: `ALLOW_PAID_API=1 PRESET_FILL=1`로 `tests/live/matter-presets.live.test.ts`(유료) → `node scripts/build-matter-presets.mjs`. 검사: `presets.test.ts`.
- **화면 구성 (2026-11-26 사용자 요청)**: 화면은 둘뿐이다 — ① 사건 목록(`MattersView`: 머리 패널의 새 사건 만들기 → 내 사건 → 가상 사건) ② 사건 한 건(`MatterBoard`: 내 사건·가상 사건 공통). 목록과 탭을 한 화면에 겹쳐 두지 않는다. 단계 메뉴 글자는 `MatterBoard`의 `STAGES` 한 곳(한눈에 · 1 모으기 · 2 정리하기 · 3 찾고 기록하기)에서 관리하고, 개요는 '다음 할 일' 하나(`nextStep`, 담긴 항목 수만 본다)를 먼저 보인다. 긴 설명은 `SectionTitle`의 `more`('자세히')로 접는다 — 확인 범위 같은 고지 문장은 지우지 않고 옮긴다. 판례 리서치(DEC-054)처럼 사이트 기본 바탕 위 같은 폭의 둥근 패널이고, 화면 끝까지 칠한 띠를 쓰지 않는다.
- **이름**: 본인 사건을 정리하는 도구라 서류에 적힌 이름을 가리지 않고 저장·표시한다(사용자 결정, DEC-006의 예외 — 이 테이블·화면만). 연락처·등록번호·계좌·주소 꼴은 저장 전에 가린다(`maskContacts`). 서류 사진은 저장하지 않는다.
- **모델로 가는 글**: 이름·연락처를 가린 문장만(`maskForModel`). 가릴 이름은 서버가 저장된 사건의 당사자에서 모은다(`maskNamesOf`, 요청의 `matterId`). 사진만 예외이고 동의 두 항목을 받는다(DEC-052).
- **근거**: 쟁점에 붙는 문단은 법제처 조회로 인용을 확인하고 출처가 응답 목록에 있는 것만(절대 규칙 1). 서류 읽기 결과 속 법령 조문·사건번호는 법제처 재조회(`readingClaims` → 조문은 `getArticle` + 법령 이름 글자 일치, 사건번호는 verify_citations → `applyReadingChecks`)로 실존이 확인된 것만 남기고, 나머지는 글에서 번호 자리를 가리고 조항 목록에서 뺀다(사용자 결정 2026-11-24). 법령 이름이 없는 계약·약관 조항은 서류 속 조항으로 그대로 둔다. 판별이 애매하면 가리는 쪽으로 틀린다(조사·접속어 낱말 뒤부터 법령 이름으로 보고, "같은 법"·다른 나라·옛 법령은 늘 가림, 사람 이름이 섞인 조회 문자열은 보내지 않음).
- **기업 조사**: 법인·사업자만. 개인은 조사하지 않는다. 우리 서버는 웹 페이지를 긁지 않고 Claude의 웹 검색·웹 가져오기 도구를 쓴다. 출처는 도구가 실제로 가져온 주소만 싣고, 읽지 못한 링크(자동 접근을 막은 사이트)는 알린 뒤 본문 붙여 넣기를 받는다. 사람 이름 꼴(직함 포함)의 이름과 개인 계정 사이트 링크는 받지 않고(`looksLikePersonName`), 상호·기관 표지가 없는 이름은 사용자의 "회사·기관 이름" 확인(`isBusiness`)이 있어야 보낸다. 지시문은 사람이면 조사하지 않고 거절 값(`COMPANY_REFUSAL`)만 쓰게 한다. 평가·전망·추천 문장, 검증하지 않은 조문·사건번호 문장, 연락처는 결과에서 뺀다. 공개 자료에 적힌 대표자 이름 한 항목만 남길 수 있다(본인 계정에만 저장·표시, 사용자 결정 — CLAUDE.md 절대 규칙 4의 예외 문장).
- **비용**: 호출별 상한(lib/ai/cost.ts, 모두 임시값)과 전체 예산, 사용자별 하루 `MATTER_AI_RATE`회. 기업 조사는 건당 상한이 없다(사용자 결정) — 예산에서 `COMPANY_RESERVE_USD`를 잡고 실제 금액으로 정산하며, 한 번의 금액은 도구 횟수(`COMPANY_TOOL_LIMITS`)가 정한다. 웹 검색 요금은 비용 장부(`withCostCap`의 `charge`)에 더하고, 잡아 둔 금액을 넘으면 `settleAiQuota`가 넘은 몫을 더 차감한다.
- **AI 고지**: AI가 읽거나 쓴 내용(서류에서 읽은 자료, AI 쟁점, AI 노트)에는 `AI_NOTICE`를 붙인다.

## 아직 확인하지 못한 것

- 실제 사진 판독 품질, 기업 조사의 실제 비용 (유료 호출 — 사용자 확인 뒤 1회씩).
- 사건 자료 암호화·접근 기록·보유 기한 (PRD OQ-012).
- 앱(`mobile/`)에는 넣지 않았다.
- 가상 사건 프리셋 보강(DEC-061): 빈 쟁점 근거·서류 원본(`docs[].body`, 자료 탭 '원본 보기')·'한눈에 보는 요약본' 노트는 `tests/live/matter-presets-enrich.live.test.ts`(유료, `PRESET_ENRICH=1`)가 `presets.json`에 사건 단위로 바로 쓰고, 다시 돌리면 채운 곳은 건너뛴다(생각 단계 `PRESET_EFFORT`, 기본 medium). 로그인 화면은 '내 사건 | 가상 사건 예시' 탭이고 예시는 '내 사건으로 가져오기'로 계정에 복사한다.

## 여러 파일에 걸친 규칙 (CLAUDE.md에서 옮김, 2026-11-25)

- 사건 진행(F-016, DEC-053, lib/matters README): `/matters`(components/matters, 흑백 톤 — `ui.tsx`의 `Hover`·`Fold`로 자세한 내용을 띄우고 펼친다). 로그인 전용(`requireMatterUser`) — 로그인 전에는 가상 사건 프리셋(`lib/matters/presets.json`, `PresetWorkspace`, DEC-061)을 저장 없이 보여 준다, 사건 한 건 = `matters.data`(jsonb, 모양은 lib/matters/model.ts `MatterData`, 저장 검증은 policy.ts `MatterDataZ`). **정리 도구라 승패·유불리·책임 항목을 만들지 않는다.** 이름은 저장·표시하되(이 테이블·화면만의 예외) 연락처 꼴은 `maskContacts`로 가리고, 모델로 가는 글은 `maskForModel`(scanInput + 사건의 개인 이름)로 가린다. AI 경로 넷(`/matters/read`·`issues`·`company`·`summarize`)은 모두 lib/matters/ai-gate.ts `runMatterAi`(사용자별 하루 `MATTER_AI_RATE` → 무료 모드·예산 → 호출 → `settleAiQuota`)를 거친다 — 새 AI 경로도 이 함수로. 쟁점 정리는 `runDeepAnalysis` + `verifyDraft`를 그대로 쓰고 검증된 문단만 낸다(lib/ai/matter.ts). 기업 조사(lib/ai/company.ts)는 Claude 웹 검색·웹 가져오기 도구를 쓰고 우리 서버는 웹 페이지를 긁지 않는다 — 출처는 도구가 가져온 주소만 싣는다. 모델은 Opus 5.5, **건당 금액 상한은 없다**(사용자 결정 2026-11-24 — 예산에서 `COMPANY_RESERVE_USD`를 잡고 실제 금액으로 정산, 한 번의 금액은 도구 횟수 `COMPANY_TOOL_LIMITS`가 정하고 웹 검색 건당 `WEB_SEARCH_USD`가 붙는다). 사람 이름 꼴의 이름은 `looksLikeCompanyName`이 거절한다. 구조도(StructureMap)는 사건 자료로 코드가 그린다. 개인에 대한 조사·웹 검색은 만들지 않는다.
