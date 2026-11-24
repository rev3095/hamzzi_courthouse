# lib/materials — 자료 첨부 (F-017, DEC-058)

일반 질문·DeepSearch·결과 화면 심층 질문(이어 묻기)·판례 검색에 붙인 사진(대화 캡처·영수증·현장 사진·서류 등)을 읽어 "어떤 자료인지 · 적힌 내용 · 확인하지 못한 것"으로 정리하고, 그 정리를 질문의 답변과 검색에 쓴다.

## 흐름

1. 사진·문서 붙이기 (`components/ask/useAttachments`·`AttachTray`, 서류 분석과 같은 버튼, 30개까지) — 사진은 브라우저에서 줄여 JPEG로, 문서는 글만 꺼낸다(lib/client/docs). 이때는 서버로 보내지 않는다. 홈 질문창은 보낼 때 `AttachChoice`로 자료 첨부/서류 분석(F-015)을 고른다.
2. 동의 (`components/ask/MaterialsFlow`) — 사진 전송 동의와 민감정보 처리 동의를 따로 받는다.
3. 판독 `POST /api/v1/materials/read` → `lib/ai/materials.ts` (Haiku 비전 1회) → `screenMaterials`.
4. 확인·수정 — 자료마다 종류·요약·적힌 내용을 고치거나 뺀다.
5. 질문 — `useAsk.send(text, true, deep, onCreated, materials)` → `POST /inquiries`가 `parseStoredMaterials`로 다시 가려 `inquiries.materials`에 둔다 → `/analyze`가 `readStoredMaterials`로 읽어 `runLiteAnalysis`·`runDeepAnalysis`에 넘긴다.
6. 결과 — 검증 뒤 `buildMaterialsMap`이 자료마다 그 자료를 참고한 남은 문단을 잇고, `components/result/MaterialsView`가 그린다.
7. 검색 화면 — 판독 정리를 그 화면 메모리에만 두고, 고른 검색어(`queries`)로 지금처럼 법제처만 찾는다.

## 파일

| 파일             | 책임                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limits.ts`      | 브라우저·서버가 함께 쓰는 한도·자료 종류(`MATERIAL_KINDS`)·기본 질문. 다른 모듈을 끌어오지 않는다                                                    |
| `policy.ts`      | 순수 규칙: 판독 형식(`MATERIALS_READING_SCHEMA`), `screenMaterials`·`parseStoredMaterials`, 모델 입력 `materialsBlock`, 답변 형식 `withMaterialRefs` |
| `map.ts`         | 결과 화면용 자료 지도 `buildMaterialsMap`·`parseMaterialsMap` (브라우저 묶음에 들어가 zod·limits만 쓴다)                                             |
| `tips.ts`        | 자료 종류별 고정 활용 안내(챙겨 둘 점·함께 낼 수 있는 곳). 모델이 쓰지 않는다                                                                        |
| `policy.test.ts` | 위 규칙과 안내 문안의 단위 테스트                                                                                                                    |

## 지키는 것

- **사진·파일**: 서류 분석과 같은 예외(절대 규칙 4 예외 하나, DEC-052·055)와 같은 입력 블록(`documentBlocks`) — 사진·PDF는 동의한 판독 호출 1회에만 그대로, 문서 글은 가린 글만 보내고 저장·로그하지 않는다. 토큰 세기에도 보내지 않는다. 응답·저장은 가린 정리뿐이다(파일마다 하나, 30개까지).
- **가리기**: `scanInput` + 서류 분석의 `maskMore`(모델이 적어 준 개인 이름, 역할어 뒤 이름 꼴, 차량번호·생년월일·지번 주소). 질문과 함께 저장할 때 서버가 한 번 더 건다(화면에서 고칠 수 있어서).
- **근거가 아님**: 자료는 사용자 자료다. 모델에는 `<첨부_자료>`로 "법령·판례 근거가 아니며 출처·인용 구절로 쓸 수 없음"을 밝혀 넘긴다. 문단의 `source`는 언제나 근거 키이고, 인용 검증과 숫자 규칙(근거 원문에 있어야 함)은 그대로다 (절대 규칙 1·3). 자료 속 금액은 자료 카드에만 "적힌 그대로" 보인다.
- **판단하지 않음**: 증거로서의 힘·유불리·결과를 말하는 문장은 판독에서 뺀다. 화면에도 점수·게이지를 두지 않는다 (절대 규칙 2). 활용 안내는 고정 문안이고 숫자·단정 표현을 테스트가 막는다.
- **횟수·비용**: 판독은 질문 횟수를 차감하지 않고 다 썼는지만 본다. 같은 네트워크 1시간 한도는 서류 판독(`CASEFILE_RATE`)과 함께 센다. 1건 상한 `MATERIALS_READ_COST_CAP_USD`(임시값), 예산은 `MATERIALS_WEIGHT`단위로 잡고 실제 쓴 금액으로 정산한다. 분석은 질문 1회, 단계 상한 그대로.
- **예시 재생**: 자료가 붙은 질문은 예시 질문과 글이 같아도 재생하지 않는다.

## 아직 확인하지 못한 것

- 실제 사진의 판독 품질 (유료 호출이라 사용자 확인 뒤 1회만 — 절대 규칙 8).
- 자료가 붙은 질문의 답변 입력이 Light 단계 상한($0.002) 안에 드는지 — 넘으면 근거를 하나씩 빼고 다시 잰다.
- 앱(`mobile/`)에는 넣지 않았다.
