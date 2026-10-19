-- DATA_MODEL.md 3절(사용자·분석)·4절(운영·통제) 테이블 (F-001, F-002, F-005, F-007, F-013, DEC-005, DEC-006)
-- 쓰기는 서버(API 라우트, service_role)만 한다. 사용자는 RLS로 본인 행 읽기만 (DATA_MODEL 6절).
-- 원문 컬럼은 두지 않는다. 사용자 입력은 마스킹본(masked_text, answer_masked, comment_masked)만 저장한다 (DEC-006).
-- 보유 기간(expires_at 값)은 OQ-DM-03 확정 전까지 비워 둔다.

create type public.user_role as enum ('user', 'lawyer', 'admin');
create type public.inquiry_status as enum ('draft', 'need_info', 'analyzed', 'failed');
create type public.analysis_outcome as enum ('grounded', 'no_result_in_scope', 'ai_suggestion');
create type public.citation_kind as enum ('case', 'statute');
create type public.citation_status as enum ('verified', 'removed', 'unverified');
create type public.gate_status as enum ('pending_review', 'conditional', 'approved', 'excluded');
create type public.consent_kind as enum (
  'sensitive_info', 'brief_posting', 'disclosure_to_lawyer', 'model_improvement'
);
create type public.deletion_status as enum ('received', 'processing', 'completed');

-- append-only 테이블(gate_changes, audit_logs): service_role을 포함해 수정·삭제를 막는다
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

-- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'user',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.display_name is '[PII] 표시 이름';
comment on column public.profiles.role is 'lawyer는 F-010 승인 시에만. 사용자는 쓰기 권한이 없다(서버만 변경)';

-- 가입 시 프로필 자동 생성 (role은 항상 user로 시작)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS 정책에서 쓰는 관리자 판별. security definer로 profiles RLS 재귀를 피한다.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- anon_sessions — 비로그인 질문 1회 추적 (DEC-005). 서버 전용
create table public.anon_sessions (
  id uuid primary key default gen_random_uuid(),
  ip_hash text,
  questions_used int not null default 0 check (questions_used between 0 and 1),
  claimed_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.anon_sessions.ip_hash is '남용 방지용 해시. 원본 IP 저장 금지';
comment on column public.anon_sessions.expires_at is '보유 기간 = OQ-DM-03';

-- inquiries — 사용자 문제 입력 (F-001, F-002, F-007)
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  anon_session_id uuid references public.anon_sessions (id) on delete cascade,
  masked_text text not null,
  pii_findings jsonb not null default '{}'::jsonb,
  sensitive_consent_at timestamptz,
  structured jsonb,
  user_edited boolean not null default false,
  status public.inquiry_status not null default 'draft',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(user_id, anon_session_id) >= 1)
);
create index inquiries_user_created_idx on public.inquiries (user_id, created_at desc);
create index inquiries_anon_session_idx on public.inquiries (anon_session_id);
create index inquiries_expires_at_idx on public.inquiries (expires_at);
-- 같은 익명 세션의 분석 완료 inquiry는 1건까지 (DEC-005). 서버 검사의 마지막 방어선
create unique index inquiries_anon_one_analyzed_idx on public.inquiries (anon_session_id)
  where status = 'analyzed' and user_id is null;

comment on column public.inquiries.masked_text is '[PII-M] 마스킹본 — 저장·LLM 전달되는 유일한 입력 텍스트. 원문 컬럼 없음 (DEC-006)';
comment on column public.inquiries.pii_findings is '탐지 유형·개수만. 값 저장 금지';
comment on column public.inquiries.structured is '[PII-M] {facts[], inferred[], to_confirm[], issues[], case_type}';
comment on column public.inquiries.expires_at is '보유 기간 = OQ-DM-03';

-- followup_questions (F-002 AC2)
create table public.followup_questions (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  ord int not null check (ord between 1 and 3),
  question text not null,
  answer_masked text,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inquiry_id, ord)
);

comment on column public.followup_questions.question is '[PII-M] 마스킹본을 바탕으로 생성된 질문';
comment on column public.followup_questions.answer_masked is '[PII-M] 답변 마스킹본';

-- analysis_results — AI 결과 (PRD 8.3)
create table public.analysis_results (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  response jsonb not null,
  outcome public.analysis_outcome not null,
  model text not null,
  prompt_version text not null,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  citations_total int not null default 0,
  citations_removed int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (citations_removed between 0 and citations_total)
);
create index analysis_results_inquiry_created_idx on public.analysis_results (inquiry_id, created_at desc);

comment on column public.analysis_results.response is '[PII-M] 8.3 구조 응답 — 인용 검증(F-005)을 거친 결과만 저장. removed 인용·검증 전 LLM 출력은 넣지 않는다';

-- result_citations (F-005)
create table public.result_citations (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.analysis_results (id) on delete cascade,
  kind public.citation_kind not null,
  case_id uuid references public.court_cases (id) on delete set null,
  statute_id uuid references public.statutes (id) on delete set null,
  claimed_ref text not null,
  status public.citation_status not null,
  relevance real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'case' or case_id is null),
  check (kind = 'statute' or statute_id is null),
  -- 검증 성공(verified)이면 DB 행이 반드시 있다
  check (status <> 'verified' or num_nonnulls(case_id, statute_id) = 1)
);
create index result_citations_result_idx on public.result_citations (result_id);

comment on column public.result_citations.relevance is '검색 유사도. 승소 가능성과 무관 (PRD 8.3)';

-- result_feedback
create table public.result_feedback (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.analysis_results (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  helpful boolean not null,
  comment_masked text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.result_feedback.comment_masked is '[PII-M] 의견 마스킹본';

-- feature_gates (F-013). 기본값은 모두 pending_review — 승인은 법률 검토 후 사람이 한다
create table public.feature_gates (
  feature_key text primary key,
  status public.gate_status not null default 'pending_review',
  conditions jsonb not null default '[]'::jsonb,
  review_ref text,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);

insert into public.feature_gates (feature_key) values
  ('lawyer_verification'),
  ('brief_posting'),
  ('proposals'),
  ('billing'),
  ('legal_documents'),
  ('consult_agent'),
  ('procedure_guide');

-- gate_changes — 게이트 변경 이력 (append-only)
create table public.gate_changes (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null references public.feature_gates (feature_key),
  from_status public.gate_status not null,
  to_status public.gate_status not null,
  -- FK를 두지 않는다: append-only라 회원 삭제 시 SET NULL·cascade를 할 수 없다. 탈퇴 후에는 가명 uuid로 남는다
  actor_id uuid not null,
  reason text not null,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gate_changes_key_at_idx on public.gate_changes (feature_key, at desc);

create trigger gate_changes_append_only before update or delete on public.gate_changes
  for each row execute function public.forbid_mutation();
create trigger gate_changes_no_truncate before truncate on public.gate_changes
  for each statement execute function public.forbid_mutation();

-- consents (F-007 AC2, Phase 2 F-009·F-012)
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.consent_kind not null,
  subject_id uuid,
  recipient text,
  purpose text not null,
  items jsonb not null default '[]'::jsonb,
  retention text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (revoked_at is null or revoked_at >= granted_at)
);
create index consents_user_kind_idx on public.consents (user_id, kind);

-- audit_logs — 감사 로그 (append-only, 사건 본문 저장 금지)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- FK를 두지 않는다 (gate_changes.actor_id와 같은 이유)
  actor_id uuid,
  actor_role public.user_role,
  action text not null,
  target_table text,
  target_id uuid,
  at timestamptz not null default now(),
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audit_logs_target_idx on public.audit_logs (target_table, target_id);
create index audit_logs_at_idx on public.audit_logs (at desc);

comment on table public.audit_logs is '사건 본문·PII 값 저장 금지. 행위·대상 ID만';
comment on column public.audit_logs.action is '코드에 정의된 고정 행위 이름만 (자유 텍스트 금지)';
comment on column public.gate_changes.reason is '검토 기록 요약. 사용자 사건 내용·PII 금지';

create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function public.forbid_mutation();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.forbid_mutation();

-- deletion_requests (PRD 9.2)
create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  scope jsonb not null default '{}'::jsonb,
  status public.deletion_status not null default 'received',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deletion_requests_user_idx on public.deletion_requests (user_id);

-- updated_at 트리거 (append-only 테이블 제외)
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger anon_sessions_updated_at before update on public.anon_sessions
  for each row execute function public.set_updated_at();
create trigger inquiries_updated_at before update on public.inquiries
  for each row execute function public.set_updated_at();
create trigger followup_questions_updated_at before update on public.followup_questions
  for each row execute function public.set_updated_at();
create trigger analysis_results_updated_at before update on public.analysis_results
  for each row execute function public.set_updated_at();
create trigger result_citations_updated_at before update on public.result_citations
  for each row execute function public.set_updated_at();
create trigger result_feedback_updated_at before update on public.result_feedback
  for each row execute function public.set_updated_at();
create trigger feature_gates_updated_at before update on public.feature_gates
  for each row execute function public.set_updated_at();
create trigger consents_updated_at before update on public.consents
  for each row execute function public.set_updated_at();
create trigger deletion_requests_updated_at before update on public.deletion_requests
  for each row execute function public.set_updated_at();

-- RLS (DATA_MODEL 6절)
-- 쓰기 정책은 두지 않는다(service_role만). 비로그인 행은 서버가 익명 세션 쿠키로 확인한 뒤 service_role로 읽는다.
-- 관리자의 inquiries·결과 열람은 감사 기록이 필요해 RLS로 열지 않고 서버 경유로만 한다.
alter table public.profiles enable row level security;
alter table public.anon_sessions enable row level security;
alter table public.inquiries enable row level security;
alter table public.followup_questions enable row level security;
alter table public.analysis_results enable row level security;
alter table public.result_citations enable row level security;
alter table public.result_feedback enable row level security;
alter table public.feature_gates enable row level security;
alter table public.gate_changes enable row level security;
alter table public.consents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.deletion_requests enable row level security;

create policy profiles_read_own on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
-- 쓰기는 서버만 (role 자가 변경 차단). 정책이 없어도 컬럼 권한까지 회수해 이중으로 막는다
revoke insert, update, delete on public.profiles from anon, authenticated;

create policy anon_sessions_admin_read on public.anon_sessions
  for select to authenticated using ((select public.is_admin()));

create policy inquiries_read_own on public.inquiries
  for select to authenticated using (user_id = (select auth.uid()));

create policy followup_questions_read_own on public.followup_questions
  for select to authenticated using (
    exists (
      select 1 from public.inquiries i
      where i.id = followup_questions.inquiry_id and i.user_id = (select auth.uid())
    )
  );

create policy analysis_results_read_own on public.analysis_results
  for select to authenticated using (
    exists (
      select 1 from public.inquiries i
      where i.id = analysis_results.inquiry_id and i.user_id = (select auth.uid())
    )
  );

-- removed 인용은 화면에 표시하지 않는다 (F-005)
create policy result_citations_read_own on public.result_citations
  for select to authenticated using (
    status <> 'removed'
    and exists (
      select 1 from public.analysis_results r
      join public.inquiries i on i.id = r.inquiry_id
      where r.id = result_citations.result_id and i.user_id = (select auth.uid())
    )
  );

create policy result_feedback_read_own on public.result_feedback
  for select to authenticated using (user_id = (select auth.uid()));

create policy feature_gates_admin_read on public.feature_gates
  for select to authenticated using ((select public.is_admin()));

create policy gate_changes_admin_read on public.gate_changes
  for select to authenticated using ((select public.is_admin()));

create policy consents_read_own on public.consents
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy audit_logs_admin_read on public.audit_logs
  for select to authenticated using ((select public.is_admin()));

create policy deletion_requests_read_own on public.deletion_requests
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

-- 이전 마이그레이션에서 미뤄 둔 수집 이력 관리자 읽기
create policy ingest_runs_admin_read on public.ingest_runs
  for select to authenticated using ((select public.is_admin()));
