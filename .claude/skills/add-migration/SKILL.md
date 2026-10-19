---
name: add-migration
description: supabase/migrations에 테이블·컬럼·인덱스·RLS를 추가하거나 바꿀 때 사용. docs/DATA_MODEL.md와 PII 규칙을 맞춘다.
---

# DB 마이그레이션 추가

먼저 `docs/DATA_MODEL.md`에서 해당 테이블 절, 1절(PII 태그), 6절(RLS)만 읽는다.

## 순서
1. DATA_MODEL.md에 없는 테이블·컬럼이면 **먼저 DATA_MODEL.md 수정안을 제안**하고 승인 후 진행한다.
2. 파일 생성: `pnpm exec supabase migration new <설명>` → 생성된 SQL 파일에 작성.
3. 모든 사용자 데이터 테이블은 `enable row level security` + DATA_MODEL 6절 권한표대로 정책을 만든다.
4. `[PII]`·`[PII-S]` 컬럼은 SQL 주석으로 태그를 남긴다: `comment on column ... is '[PII] ...'`.
5. 금지:
   - 입력 원문을 담는 컬럼 (`inquiries`는 `masked_text`만, DEC-006)
   - `audit_logs`, `gate_changes`에 update/delete 권한 부여 (append-only)
   - 운영 DB에 직접 적용 — 운영 반영은 사람이 승인한다
6. 인덱스는 DATA_MODEL.md에 적힌 것을 그대로 만든다.

## 검증
- 로컬 Supabase가 실행 중이면 `pnpm exec supabase db reset`으로 처음부터 적용되는지 확인한다(Docker 필요).
- 실행할 수 없으면 그 사실을 보고에 적는다.
