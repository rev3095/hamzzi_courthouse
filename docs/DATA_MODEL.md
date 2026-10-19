# 햄찌법원 데이터 모델 (DATA_MODEL)

> 기준: `docs/PRD.md` v1.0, `docs/ARCHITECTURE.md` v0.1 · 버전 v0.1 (2026-10-19)
> DB: Supabase Postgres + pgvector (확정, DEC-004). 모든 테이블에 `created_at`, `updated_at`(timestamptz)이 있다고 보고 표에서는 생략한다.

## 1. PII 태그
| 태그 | 의미 | 처리 규칙 |
|---|---|---|
| `[PII]` | 직접 식별정보(이름·연락처·이메일·등록번호 등) | 암호화 저장, 로그·프롬프트 금지, 접근 감사 |
| `[PII-S]` | 민감정보 가능(건강·범죄경력 등, 개인정보보호법 제23조) 또는 그것이 섞일 수 있는 사건 원문 | 별도 동의 후 저장, 암호화, 원본 접근은 본인 + 감사 |
| `[PII-M]` | 마스킹·비식별 처리된 파생 텍스트 (재식별 위험 잔존) | 공개 전 간접식별 점검(F-011 AC2) |
| `[PUB]` | 공공 데이터(판례·법령), 비실명 처리된 원문 | 비식별 재검사 후 저장 |
| `[GATE]` | Phase 2 `[게이트]` 기능 전용 테이블 | F-013 승인 전 쓰기 금지 |

## 2. 법령·판례 (공공 데이터, Phase 1)
### `court_cases` — 판례 `[PUB]`
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| case_no | text | 사건번호 (예: 2023다12345) |
| court | text | 법원명 |
| decided_at | date | 선고일 |
| case_name | text | 사건명 |
| case_type | text | 민사/형사/가사/행정 등 |
| holding_summary | text | 판결요지(원천 제공분) |
| full_text | text | 판례 전문 `[PUB]` — 비실명이지만 잔여 식별정보 재검사 대상 |
| source | text | 예: `law_open_api` |
| source_id | text | 원천 시스템 ID |
| source_url | text | 원문 링크 |
| collected_at | timestamptz | 수집일 |
| content_hash | text | 변경 감지 |
| deid_check | enum(`pending`,`passed`,`flagged`) | 비식별 재검사 상태 — `passed`만 노출·검색 (`pending`·`flagged` 제외). RLS가 강제하며, RLS를 우회하는 서버(service_role) 검색은 쿼리에서 직접 거른다 |

인덱스: `unique(source, source_id)`, `unique(case_no, court)`, `(decided_at)`, `(case_type)`.

### `case_chunks` — 검색 단위
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| case_id | uuid FK → court_cases | |
| section | enum(`holding`,`order`,`reasoning`,`facts`) | 판결 구성 부분 |
| ord | int | 순서 |
| text | text | 청크 본문 `[PUB]` |
| tsv | tsvector | 키워드 검색 (형태소 분석 방식: OQ-ARC-04) |
| embedding | vector(N) | N = OQ-ARC-03 |

인덱스: `GIN(tsv)`, `HNSW(embedding)`, `(case_id, ord)`.

### `statutes` — 법령 조문 (버전별 1행)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| law_id | text | 원천 법령 ID |
| law_name | text | 법령명 |
| article_no | text | 조문 번호 (예: 제347조) |
| article_title | text | 조문 제목 |
| body | text | 조문 본문 `[PUB]` |
| effective_from | date | 시행일 |
| effective_to | date null | 다음 버전의 시행일(이 날부터 효력 없음), 현행이면 null |
| source_url | text | |
| version | text | 원천 개정 식별자 |

인덱스: `unique(law_id, article_no, effective_from)`, `(law_name, article_no)`, 현행 조회용 부분 인덱스 `where effective_to is null`.
F-004: 판결 당시 법령 = `effective_from ≤ decided_at < effective_to`, 현행 = `effective_to is null`.

### `case_statute_refs` — 판례가 인용한 법령
| 필드 | 타입 | 설명 |
|---|---|---|
| case_id | uuid FK | |
| statute_id | uuid FK null | 매칭 성공 시 |
| raw_ref | text | 판결문 표기 원문 (매칭 실패도 보존) |

PK `(case_id, raw_ref)`, 인덱스 `(statute_id)`.

### `ingest_runs` — 수집 이력 (9.3)
`id, source, started_at, finished_at, fetched, inserted, updated, failed, status(enum: running/ok/partial/failed), error_summary`

## 3. 사용자·분석 (Phase 1)
### `profiles`
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid PK = 인증 사용자 ID | 이메일 등은 인증 시스템에 `[PII]` |
| role | enum(`user`,`lawyer`,`admin`) | 기본 `user`. `lawyer`는 F-010 승인 시에만 |
| display_name | text null | `[PII]` |

### `inquiries` — 사용자 문제 입력 (F-001, F-002, F-007)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK null | 로그인 사용자. 비로그인이면 null (DEC-005) |
| anon_session_id | uuid null | 비로그인 1회 질문 추적용 익명 세션(쿠키). 로그인 시 user_id로 이관 |
| masked_text | text | 마스킹본 `[PII-M]` — 저장·LLM 전달되는 유일한 입력 텍스트. **원문 컬럼은 두지 않는다** (DEC-006) |
| pii_findings | jsonb | 탐지 유형·개수만 (값 저장 금지) |
| sensitive_consent_at | timestamptz null | 민감정보 별도 동의(F-007 AC2) |
| structured | jsonb | `{facts[], inferred[], to_confirm[], issues[], case_type}` `[PII-M]` |
| user_edited | bool | F-002 AC1 수정 여부 |
| status | enum(`draft`,`need_info`,`analyzed`,`failed`) | |
| expires_at | timestamptz | 보유 기간 = OQ-DM-03 |

인덱스: `(user_id, created_at desc)`, `(anon_session_id)`, `(expires_at)`.
제약: `user_id`와 `anon_session_id` 중 하나는 반드시 존재. 같은 `anon_session_id`의 분석 완료 inquiry는 1건까지 (DEC-005, 서버에서 검사).
원문 저장이 나중에 필요해지면: 새 결정(DEC) + 별도 동의 + 암호화 컬럼 추가 마이그레이션으로만 도입한다 (DEC-006).

### `anon_sessions` (DEC-005)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | 쿠키 값 |
| ip_hash | text | 남용 방지용 해시(원본 IP 저장 안 함) |
| questions_used | int | 0 또는 1 |
| claimed_by | uuid FK null | 로그인 후 연결된 사용자 |
| expires_at | timestamptz | 보유 기간 = OQ-DM-03 |

### `followup_questions` (F-002 AC2)
`id, inquiry_id FK, ord(1~3), question text, answer_masked text [PII-M] null, answered_at`

### `analysis_results` — AI 결과 (8.3 구조)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| inquiry_id | uuid FK | |
| response | jsonb | 8.3 구조 필드 (요약·사실/미확인·쟁점·판단·법령·차이·추가 확인·다음 단계) `[PII-M]` |
| outcome | enum(`grounded`,`no_result_in_scope`,`ai_suggestion`) | F-006: 유사도 미달이면 `ai_suggestion` |
| model | text | 예: `claude-opus-5-5` |
| prompt_version | text | |
| tokens_in, tokens_out | int | 단위경제(11) |
| latency_ms | int | 성능(13) |
| citations_total, citations_removed | int | F-005 실패율 |

### `result_citations` (F-005)
| 필드 | 타입 | 설명 |
|---|---|---|
| result_id | uuid FK | |
| kind | enum(`case`,`statute`) | |
| case_id / statute_id | uuid FK null | 검증 성공 시 반드시 값 존재 |
| claimed_ref | text | LLM이 출력한 표기 |
| status | enum(`verified`,`removed`,`unverified`) | `removed`는 화면에 표시하지 않음 |
| relevance | real null | 검색 유사도 (승소 가능성과 무관 — 8.3) |

### `result_feedback`
`result_id FK, user_id FK null, helpful bool, comment_masked text [PII-M] null`

## 4. 운영·통제
### `feature_gates` (F-013)
| 필드 | 타입 | 설명 |
|---|---|---|
| feature_key | text PK | 법률 게이트: `lawyer_verification`, `brief_posting`, `proposals`, `billing`, `legal_documents` · Phase 2 출시 플래그: `consult_agent`, `procedure_guide` |
| status | enum(`pending_review`,`conditional`,`approved`,`excluded`) | 기본 `pending_review` |
| conditions | jsonb | 조건부 승인 항목과 해결 여부 |
| review_ref | text | 법률 검토 기록 위치 |
| approved_by | uuid FK null | |
| approved_at | timestamptz null | |

### `gate_changes`
`id, feature_key FK, from_status, to_status, actor_id, reason, at` — 삭제·수정 불가(append-only).

### `consents` (F-007 AC2, F-009, F-012)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| kind | enum(`sensitive_info`,`brief_posting`,`disclosure_to_lawyer`,`model_improvement`) | |
| subject_id | uuid null | 관련 inquiry/summary/proposal |
| recipient | text null | 받는 자 (F-009 AC3) |
| purpose | text | |
| items | jsonb | 제공 항목 |
| retention | text | 보유 기간 |
| granted_at / revoked_at | timestamptz | 철회 시 `revoked_at` |

### `audit_logs`
`id, actor_id, actor_role, action, target_table, target_id, at, ip_hash` — append-only, 사건 본문 저장 금지.

### `deletion_requests` (9.2)
`id, user_id, requested_at, completed_at, scope jsonb, status`

## 5. Phase 2 `[GATE]`
| 테이블 | 핵심 필드 | PII | F-ID |
|---|---|---|---|
| `agent_turns` | inquiry_id, ord, role(`agent`/`user`), content_masked, decision(`agree`/`disagree`/null) | `[PII-M]` | F-008 |
| `case_summaries` | inquiry_id, body(사실관계·쟁점·희망 업무·근거 판례 id), user_confirmed_at, version | `[PII-S]` | F-008, F-009 |
| `public_briefs` | summary_id, title, field, region_level, amount_range, stage, indirect_risk_check(`passed`/`needs_edit`), status(`draft`/`posted`/`closed`) | `[PII-M]` | F-011 |
| `lawyer_profiles` | user_id, name `[PII]`, registration_no `[PII]`, office, fields[], public_fee_note | `[PII]` | F-010, F-012 |
| `lawyer_verifications` | lawyer_id, method, evidence_ref, status(`pending`/`approved`/`rejected`/`revoked`), decided_by, decided_at | `[PII]` | F-010 |
| `proposals` | brief_id, lawyer_id, message, fee_note, status(`proposed`/`selected`/`in_consultation`/`closed`/`declined`) | — | F-012 |
| `disclosures` | proposal_id, consent_id, items jsonb, disclosed_at | 기록만 | F-012 AC2 |
| `procedure_templates` | case_type, version, steps jsonb(`label`, `duration_min/max`, `unit`, `difficulty`: `self`/`depends`/`expert`, `source`) | `[PUB]` | F-014 |

`procedure_templates`는 계산 모듈의 입력이다. 단계 기간·난이도 값과 출처를 누가 작성·검수할지는 OQ-DM-09.

`public_briefs`는 `case_summaries`와 **별도 테이블**로 두고, 변호사 역할에는 `public_briefs`만 열린다. 상세 내용은 `disclosures`로 허용된 항목만 제공된다.

## 6. 접근 권한 (RLS 요약)
| 테이블 | user | lawyer(승인) | admin |
|---|---|---|---|
| court_cases, case_chunks, statutes | 읽기 | 읽기 | 읽기·쓰기(수집기 서비스 계정) |
| inquiries, followup_questions, analysis_results | 본인 행 (비로그인은 같은 `anon_session_id`만, 서버 경유) | ✗ | 감사 기록 남기고 제한 열람 |
| anon_sessions | 서버 전용 | ✗ | 읽기 |
| consents, deletion_requests | 본인 행 | ✗ | 처리용 읽기 |
| case_summaries, agent_turns | 본인 행 | ✗ | 제한 열람 |
| public_briefs | 본인 행 | `status='posted'` 행 읽기 | 읽기 |
| proposals | 본인 사건 제안 읽기·선택 | 본인 제안 쓰기 | 읽기 |
| disclosures에 연결된 항목 | 본인 | 해당 제안 항목만 | 감사 |
| feature_gates, gate_changes | ✗ | ✗ | 읽기·변경(감사) |
| audit_logs | ✗ | ✗ | 읽기만 |

## 7. 보유·파기
PRD 9.2에 따라 항목별 보유 기간을 정의해야 하나 기간 값은 미정(OQ-DM-03, PRD OQ-004). `expires_at` 도달 시 원문·마스킹본·결과를 파기하고, 집계 지표(토큰·지연·인용 실패율)만 남긴다(제안).

---
## OPEN QUESTION
| ID | 질문 | 영향 | 관련 PRD |
|---|---|---|---|
| ~~OQ-DM-01~~ | ✅ 해결: 비로그인 질문 1회, 이후 소셜 로그인 (DEC-005) | inquiries, anon_sessions | 12 |
| ~~OQ-DM-02~~ | ✅ 해결: 마스킹본만 저장, 원문 컬럼 없음 (DEC-006) | inquiries | 9.2 |
| OQ-DM-03 | 항목별 보유 기간(입력·결과·동의 기록·감사 로그·익명 세션) | 파기 배치 | 9.2, OQ-004 |
| OQ-DM-04 | 암호화 방식(DB 컬럼 암호화 vs 애플리케이션 암호화)과 키 관리 — 대상: 변호사 `[PII]` 필드, Phase 2 사건 요약서 | lawyer_profiles, case_summaries | 13 |
| OQ-DM-10 | 비로그인 사용자의 질문·결과를 로그인 후 계정으로 옮길지(이관) | anon_sessions.claimed_by | DEC-005 |
| OQ-DM-05 | 판례 전문을 저장·재게시해도 되는 범위(법제처 상업 재게시 조건) — 안 되면 요지·메타데이터·링크만 | court_cases.full_text | 9.1 |
| OQ-DM-06 | 상담 데이터를 모델 개선·평가셋에 쓸지(`consents.model_improvement`) | consents | 9.2 |
| OQ-DM-07 | 변호사 검증 방식과 보관할 증빙 범위 | lawyer_verifications | OQ-006 |
| OQ-DM-08 | 게시판 공개 필드 목록 확정(`public_briefs` 컬럼) | public_briefs | OQ-004 |
| OQ-DM-09 | 절차 템플릿의 기간·난이도 값 출처와 검수자(법률 전문가 검수 필요 여부) | procedure_templates | F-014, OQ-007 |
