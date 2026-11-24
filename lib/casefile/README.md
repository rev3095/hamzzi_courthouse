# lib/casefile — 서류 분석 (F-015, DEC-052)

서류 사진(내용증명·소장·고소장·계약서·메신저 대화 등)을 읽어 사건 개요로 정리하고, 사용자가 확인한 개요를 일반 질문과 같은 경로로 분석한다.

## 흐름

1. 질문창에 사진 붙이기 (`components/ask/useAttachments`·`AttachTray`) — 브라우저에서 줄여 JPEG로 바꾼다. 이때는 서버로 보내지 않는다.
2. 동의 (`components/casefile/CaseFileFlow`) — 사진 전송 동의와 민감정보 처리 동의를 따로 받는다.
3. 판독 `POST /api/v1/casefiles/read` → `lib/ai/casefile.ts` (Haiku 비전 1회) → `screenReading`.
4. 확인·수정 — 가린 사건 개요를 사용자가 고치고, 서류에서 자신이 어느 쪽인지 고른다.
5. 분석 — `composeCaseText`로 합친 문장을 `useAsk.send(text, true, true)`로 보낸다. 이후는 일반 질문과 같다(가리기 → 저장 → DeepSearch 분석 → 인용 검증 → 횟수 차감).
6. 결과 화면 `components/result/PartiesCard` — 이 탭에 둔 당사자 목록과 법인·사업자 공개 정보 찾아보기(`lib/business`).

## 파일

| 파일             | 책임                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limits.ts`      | 브라우저·서버가 함께 쓰는 한도, 역할·자리·종류 값, `composeCaseText`. 다른 모듈을 끌어오지 않는다                                                         |
| `policy.ts`      | 순수 규칙: `parseReadRequest`(동의·장수·크기·종류), `READING_SCHEMA`, `screenReading`·`screenParties`                                                     |
| `policy.test.ts` | 위 규칙의 단위 테스트                                                                                                                                     |
| `examples.ts`    | 예제 프리셋 (2026-11-25): `examples.json`(직접 쓴 가상 서류를 실제 흐름으로 미리 분석한 결과, 검증 통과 문단만) 읽기·재생. 화면 `/casefile/examples/[id]` |

## 지키는 것

- **사진**: 미리 가릴 수 없어 동의한 요청의 판독 호출에만 그대로 쓴다(절대 규칙 4의 예외, DEC-052). 저장·로그하지 않는다. 응답에도 싣지 않는다.
- **판독 결과**: 가린 문장만 내보낸다. 조문 번호·사건번호(지급명령·가사·회생 등 서류에 흔한 사건부호 포함)가 든 문장과, 결과를 내다보거나 유불리를 말하는 문장은 뺀다(절대 규칙 1·2). 판독은 법률 판단을 하지 않는다 — 판단은 인용 검증을 거치는 분석 답변에만 있다.
- **당사자**: 서류에 적힌 역할(`PARTY_ROLES`)과 자리(`claimant` 요구·청구하는 쪽 / `respondent` 받는 쪽 / `other`)만 옮긴다. 누가 옳은지 정하지 않는다. "피해자"·"가해자"는 역할 값으로 두지 않는다(AI가 고른 그 말이 상호 옆에 붙으면 판정처럼 읽힌다).
- **개인**: 이름을 내보내지 않는다(`kind: "person"`이면 `name`은 언제나 빈 문자열). 모델이 따로 적어 준 개인 이름 목록(`personNames`)은 개요·요구·상호에서 그 이름을 지우는 데만 쓰고 버린다. 그 밖에 `scanInput`, 서류 역할어 바로 뒤의 이름 꼴(그 자리만, 판단은 lib/pii `nameAfterRelation`과 같다), 차량번호·생년월일·지번 주소 꼴을 더 가린다(`maskMore`). 날짜·금액은 번호 꼴로 보지 않는다. 상호·기관 이름은 표지(주식회사·법원 등)가 있을 때만 남기고 대표자·담당자 이름과 직함은 잘라 낸다(`orgNameOf`). 개인을 찾는 검색은 만들지 않는다.
- **서류 종류**: 정해진 목록(`DOC_TYPES`)의 값만 받는다.
- **사진 전송 횟수**: 판독 호출 한 번뿐이다. 토큰 세기 호출에도 사진을 보내지 않고 장당 고정값으로 상한을 확인한다.
- **횟수·비용**: 판독은 질문 횟수를 차감하지 않고 다 썼는지만 본다(차감은 분석 때). 같은 네트워크 1시간 `CASEFILE_RATE`회, 1건 상한 `CASEFILE_READ_COST_CAP_USD`(임시값), 전체 예산은 `CASEFILE_WEIGHT`단위로 잡고 실제 쓴 금액으로 정산한다.

## 아직 확인하지 못한 것

- 실제 사진의 판독 품질 (유료 호출이라 사용자 확인 뒤 1회만 — 절대 규칙 8).
- 판독 1건 상한 금액 (무과금 토큰 세기로 사진 토큰을 잰 뒤 사용자가 정한다).
- 앱(`mobile/`)에는 넣지 않았다.

## 예제 프리셋 (2026-11-25)

- 서류 그림: `evals/casefile-examples/docs/*.txt`(직접 쓴 가상 문서) → `scripts/render_casefile_examples.py`(무료) → `public/casefile-examples/*.png`. 2건은 실제 서면의 양식·쓰는 방식만 따랐고 사실관계·당사자·금액은 새로 썼다. 원본 자료(`evals/raw-data`)는 저장소에 올리지 않는다.
- 만들기: `scripts/gen-casefile-examples.mjs`(**유료**, 사용자 허락 뒤) — 실제 서류 분석과 같은 길(판독 → `composeCaseText` → 질문 → DeepSearch Pro Max). 결과 `evals/casefile-examples/out/`.
- 반영: `node scripts/merge-casefile-examples.mjs`(무료) — 검증 통과 문단만, 사건 구조의 쟁점 순번을 다시 잇는다 → `examples.json`.
- 화면: `/casefile`의 '예제로 먼저 보기'(`components/casefile/CaseFileExampleList`) → `/casefile/examples/[id]`(서류 그림·읽은 내용·당사자 관계도 + `ResultPanel`의 사건 구조도). 모델·DB 호출과 질문 횟수 차감이 없다.
