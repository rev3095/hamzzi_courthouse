---
name: add-crawler
description: 햄찌법원 수집기(collector/)에 새 법령·판례 데이터 소스를 추가할 때 사용. 약관 확인부터 테스트까지 순서를 강제한다.
---

# 데이터 소스 추가

기준 문서: `docs/research/01_데이터_소스.md`, `docs/DATA_MODEL.md` 2절.

## 0. 허용 여부 (코드 작성 전, 하나라도 아니면 중단하고 사용자에게 보고)
- [ ] 공식 API 또는 공개 다운로드인가? (판결서 인터넷 열람은 **수집 금지**, 링크만)
- [ ] 이용약관·robots.txt가 자동 수집을 막지 않는가? 근거 URL을 PR 설명에 남긴다.
- [ ] 상업적 이용·재게시 조건이 확인되었나? 불명확하면 메타데이터·링크만 저장한다(OQ-DM-05).

## 1. 구현 순서
1. `collector/src/hamzzi_collector/sources/<source>.py` — 소스 하나당 파일 하나. `httpx`, 타임아웃·재시도(429/5xx 지수 백오프)·요청 간 지연은 설정값으로.
2. 파싱 결과는 `pydantic` 모델로 검증한다. 필드는 `court_cases` / `statutes` 컬럼명과 같게.
3. 저장 전 비식별 재검사: 이름·주민번호·전화·주소 패턴이 남아 있으면 `deid_check='flagged'`.
4. 증분 수집: 마지막 수집 시점 이후만. 실행마다 `ingest_runs`에 건수·실패 기록.
5. API 키는 환경변수로만 읽는다. 코드·테스트·로그에 키를 쓰지 않는다.

## 2. 테스트 (`collector/tests/`)
- 실제 응답 형태의 fixture 3개 이상(정상, 필드 누락, 오류 응답). 네트워크 호출 없이 통과해야 한다.
- 비식별 재검사가 PII 패턴을 `flagged`로 표시하는지 테스트한다.
- 실행: `cd collector && uv run pytest && uv run ruff check .`

## 3. 마무리
- `docs/research/01_데이터_소스.md` 표에 소스를 추가하거나 갱신한다.
- 커밋 메시지에 관련 ID를 넣는다 (예: `collector: 법제처 판례 API 수집기 (F-003, 9.1)`).
