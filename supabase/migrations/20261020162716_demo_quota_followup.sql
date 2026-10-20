-- 데모 마이그레이션 (DATA_MODEL 3절 "데모 마이그레이션", DEC-009~011)
-- 1) 비로그인 질문 3회 (DEC-010)  2) 같은 IP 해시 24시간 분석 상한(남용 방지)  3) 이어 묻기 (F-002 AC3)
-- 4) 실시간 조회 인용 저장 (F-005 AC2 — 판례 본문은 저장하지 않고 60자 이내 인용 구절만, DEC-007)

-- 1) anon_sessions.questions_used 0~1 → 0~3
alter table public.anon_sessions
  drop constraint if exists anon_sessions_questions_used_check;
alter table public.anon_sessions
  add constraint anon_sessions_questions_used_check check (questions_used between 0 and 3);
comment on table public.anon_sessions is '비로그인 질문 3회 추적 (DEC-005, DEC-010). 서버 전용';

-- 1회 제한용 유일 인덱스는 3회 규칙과 맞지 않는다. 횟수는 consume_anon_question이 원자적으로 센다
drop index if exists public.inquiries_anon_one_analyzed_idx;

-- 2) anon_usage — 비로그인 분석 1회 = 1행 (append-only). 같은 IP 해시의 24시간 사용량을 센다
create table public.anon_usage (
  id uuid primary key default gen_random_uuid(),
  anon_session_id uuid not null references public.anon_sessions (id) on delete cascade,
  ip_hash text,
  used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index anon_usage_ip_used_idx on public.anon_usage (ip_hash, used_at desc);
create index anon_usage_session_idx on public.anon_usage (anon_session_id);

comment on table public.anon_usage is '비로그인 분석 사용 기록. 원본 IP·입력 내용 저장 금지 (DEC-010)';
comment on column public.anon_usage.ip_hash is 'HMAC-SHA256(IP, ANON_IP_SALT). 원본 IP 저장 금지';

create trigger anon_usage_updated_at before update on public.anon_usage
  for each row execute function public.set_updated_at();

-- 서버 전용: 정책 없음(service_role만). append-only
alter table public.anon_usage enable row level security;
revoke update, delete on public.anon_usage from anon, authenticated;

-- 비로그인 분석 1회 소비. 세션 3회·IP 해시 24시간 상한을 한 트랜잭션에서 확인하고 올린다.
-- 반환: 'ok' | 'session_limit' | 'ip_limit' | 'unknown_session'
create or replace function public.consume_anon_question(
  p_session uuid,
  p_ip_hash text,
  p_session_limit int,
  p_ip_limit int,
  p_window interval
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  used int;
begin
  if p_session_limit < 1 or p_ip_limit < 1 or p_window <= interval '0' then
    raise exception 'invalid limits';
  end if;

  select questions_used into used from public.anon_sessions where id = p_session for update;
  if not found then
    return 'unknown_session';
  end if;
  if used >= p_session_limit then
    return 'session_limit';
  end if;

  if p_ip_hash is not null then
    -- 같은 IP 해시의 동시 요청을 직렬화한다
    perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));
    if (
      select count(*) from public.anon_usage
      where ip_hash = p_ip_hash and used_at > now() - p_window
    ) >= p_ip_limit then
      return 'ip_limit';
    end if;
  end if;

  update public.anon_sessions
    set questions_used = questions_used + 1,
        ip_hash = coalesce(p_ip_hash, ip_hash)
    where id = p_session;
  insert into public.anon_usage (anon_session_id, ip_hash) values (p_session, p_ip_hash);
  return 'ok';
end;
$$;

revoke execute on function public.consume_anon_question(uuid, text, int, int, interval)
  from public, anon, authenticated;
grant execute on function public.consume_anon_question(uuid, text, int, int, interval)
  to service_role;

-- 3) 이어 묻기: 앞선 inquiry (같은 소유자·분석 완료만 — 서버에서 검사)
alter table public.inquiries
  add column parent_inquiry_id uuid references public.inquiries (id) on delete set null;
alter table public.inquiries
  add constraint inquiries_parent_not_self check (parent_inquiry_id is null or parent_inquiry_id <> id);
create index inquiries_parent_idx on public.inquiries (parent_inquiry_id);
comment on column public.inquiries.parent_inquiry_id is '이어 묻기의 앞선 inquiry (F-002 AC3, DEC-011)';

-- 4) result_citations: 실시간 조회(DB 행 없음) 인용
alter table public.result_citations
  add column source text not null default 'db' check (source in ('db', 'law_open_api_live')),
  add column source_ref text,
  add column quote text check (quote is null or char_length(quote) <= 60);

comment on column public.result_citations.source is 'db = 수집 DB 행, law_open_api_live = 그 요청에서 법제처 실시간 조회 (DEC-009)';
comment on column public.result_citations.source_ref is '실시간 조회 근거 키 (law:법령명:제N조 / case:사건번호). DB 행이 없을 때 식별자';
comment on column public.result_citations.quote is '[PUB] 원문 인용 구절 60자 이내. 판례 본문 저장 금지 (DEC-007)';

-- "verified면 DB 행 필수" 제약을 실시간 조회 근거도 허용하도록 바꾼다
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.result_citations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%verified%num_nonnulls%'
  loop
    execute format('alter table public.result_citations drop constraint %I', c);
  end loop;
end;
$$;

alter table public.result_citations
  add constraint result_citations_verified_has_ref check (
    status <> 'verified'
    or (source = 'db' and num_nonnulls(case_id, statute_id) = 1)
    or (source = 'law_open_api_live' and source_ref is not null)
  );
