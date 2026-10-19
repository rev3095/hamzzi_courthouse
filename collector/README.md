# 햄찌법원 수집기 (collector)

공식 API에서 법령·판례를 수집한다. 판결서 인터넷 열람은 수집하지 않는다.

```bash
uv sync
uv run pytest
uv run ruff check .
```

## 소스
| 파일 | 대상 | 저장 테이블 |
|---|---|---|
| `sources/law_open_api_prec.py` | 법제처 Open API 판례 (`target=prec`) | `court_cases`, `case_statute_refs` |
| `sources/law_open_api_law.py` | 법제처 Open API 현행법령, 시행일 기준 (`target=eflaw`) | `statutes` |

- 판례 전문(`full_text`)은 OQ-DM-05 확정 전까지 저장하지 않는다. 메타데이터·판결요지·원문 링크만 저장한다.
- 국세법령정보시스템 출처 판례는 본문을 HTML로만 제공하므로 건너뛴다.
- 저장 전 비식별 재검사(`deid.py`)에서 PII 패턴이 나오면 `deid_check='flagged'`가 되어 검색에서 빠진다.
- 원문 링크는 공개 주소(`law.go.kr/LSW/...`)로 만든다. API 응답의 상세링크에는 인증키가 들어 있어 쓰지 않는다.

## 환경변수 (프로젝트 루트 `.env.local`, 사용자가 직접 관리)
| 이름 | 필수 | 설명 |
|---|---|---|
| `OPEN_LAW_API_KEY` | ✅ | 법제처 Open API 인증값(OC) |
| `SUPABASE_DB_URL` | DB 저장 시 | 수집기 서비스 계정 Postgres 접속 주소. 없으면 `--dry-run`만 가능 |
| `COLLECTOR_REQUEST_DELAY_S` | | 요청 간 지연(초), 기본 0.5 |
| `COLLECTOR_MAX_RETRIES` | | 429/5xx·네트워크 오류 재시도 횟수, 기본 4 (지수 백오프) |
| `COLLECTOR_TIMEOUT_S` | | 요청 타임아웃(초), 기본 30 |
| `COLLECTOR_LOOKBACK_DAYS` | | 증분 수집 시 마지막 성공 실행보다 앞으로 더 볼 일수, 기본 90 |
| `COLLECTOR_STORE_FULL_TEXT` | | `1`이면 판례 전문 저장. OQ-DM-05 확정 전에는 켜지 않는다 |

## 실행
```bash
# DB 없이 확인 (메모리에만 저장, 건수만 출력)
uv run --env-file ../.env.local hamzzi-collector prec --since 2026-04-01 --max 20 --dry-run
uv run --env-file ../.env.local hamzzi-collector law --query 주택임대차보호법 --dry-run

# DB 저장 (SUPABASE_DB_URL 필요). --since를 빼면 마지막 성공 실행 기준으로 증분 수집한다.
uv run --env-file ../.env.local hamzzi-collector prec
uv run --env-file ../.env.local hamzzi-collector law --query 민법
uv run --env-file ../.env.local hamzzi-collector link-refs   # 법령을 나중에 받았을 때 참조조문을 다시 매칭
```

실행마다 `ingest_runs`에 건수·실패 유형이 남는다. 오류 내용에는 오류 유형 이름만 남기고 인증키·URL·원문은 남기지 않는다.
