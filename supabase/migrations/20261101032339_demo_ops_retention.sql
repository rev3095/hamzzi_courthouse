-- 데모 운영 마이그레이션 (DATA_MODEL 3·4·7절 "데모 운영", 2026-11-01)
-- 1) 레이트 리밋 카운터 — 판례·조문 검색은 질문 3회와 별도로 세고 남용만 막는다 (DEC-017 제안)
-- 2) 도움 여부 피드백은 결과마다 1건 (다시 누르면 덮어쓴다)
-- 3) 비로그인 내 기록 삭제 (PRD 9.2) — 질문 횟수는 되살리지 않는다
-- 4) 보유 기간 30일과 자동 파기 (OQ-DM-03 → DEC-018 제안), pg_cron으로 매일 실행

-- 1) rate_limit_hits — 고정 창(window) 카운터. 키는 해시만 저장한다(원본 IP 금지)
create table public.rate_limit_hits (
  bucket text not null,
  key_hash text not null,
  window_start timestamptz not null,
  hits int not null default 0 check (hits >= 0),
  primary key (bucket, key_hash, window_start)
);
create index rate_limit_hits_window_idx on public.rate_limit_hits (window_start);
comment on table public.rate_limit_hits is '레이트 리밋 카운터. key_hash = HMAC(IP, ANON_IP_SALT) 등 해시만. 서버 전용';

alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

-- 한 번 세고 상한 안이면 true. 같은 창의 동시 요청은 행 단위 upsert로 원자적으로 센다
create or replace function public.hit_rate_limit(
  p_bucket text,
  p_key text,
  p_limit int,
  p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01');
  v_hits int;
begin
  if p_limit < 1 or p_window <= interval '0' or coalesce(p_bucket, '') = '' or coalesce(p_key, '') = '' then
    raise exception 'invalid rate limit';
  end if;
  insert into public.rate_limit_hits as r (bucket, key_hash, window_start, hits)
    values (p_bucket, p_key, v_start, 1)
    on conflict (bucket, key_hash, window_start) do update set hits = r.hits + 1
    returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.hit_rate_limit(text, text, int, interval) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, text, int, interval) to service_role;

-- 2) result_feedback — 결과마다 1건
create unique index result_feedback_result_idx on public.result_feedback (result_id);

-- 3) 비로그인 내 기록 삭제. 질문·결과·인용·피드백(연쇄 삭제)을 지우고 감사 로그를 남긴다.
--    anon_sessions 행(questions_used)과 anon_usage는 남겨 질문 횟수가 되살아나지 않게 한다
create or replace function public.delete_anon_data(p_session uuid, p_ip_hash text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not exists (select 1 from public.anon_sessions where id = p_session) then
    return -1;
  end if;
  -- 이어 묻기 자식부터 지워도 되고 부모부터 지워도 된다 (parent_inquiry_id on delete set null)
  delete from public.inquiries where anon_session_id = p_session and user_id is null;
  get diagnostics v_count = row_count;
  insert into public.audit_logs (actor_id, actor_role, action, target_table, target_id, ip_hash)
    values (p_session, null, 'anon_data_deleted', 'anon_sessions', p_session, p_ip_hash);
  return v_count;
end;
$$;

revoke execute on function public.delete_anon_data(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_anon_data(uuid, text) to service_role;

-- 4) 보유 기간 30일 (DEC-018 제안). 새 행은 기본값으로, 기존 행은 만든 날 + 30일로 채운다
alter table public.inquiries alter column expires_at set default (now() + interval '30 days');
alter table public.anon_sessions alter column expires_at set default (now() + interval '30 days');
update public.inquiries set expires_at = created_at + interval '30 days' where expires_at is null;
update public.anon_sessions set expires_at = created_at + interval '30 days' where expires_at is null;
comment on column public.inquiries.expires_at is '보유 기간: 만든 날 + 30일 (DEC-018 제안). 지나면 purge_expired_records가 결과와 함께 파기';
comment on column public.anon_sessions.expires_at is '보유 기간: 마지막 질문 + 30일 (DEC-018 제안). 남은 질문이 없을 때만 파기';

create index anon_sessions_expires_at_idx on public.anon_sessions (expires_at);

-- 익명 세션은 마지막 질문의 보유 기간까지 살아 있어야 한다 (세션을 지우면 질문이 연쇄 삭제되므로)
create or replace function public.extend_anon_session_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.anon_session_id is not null and new.expires_at is not null then
    update public.anon_sessions
      set expires_at = greatest(coalesce(expires_at, new.expires_at), new.expires_at)
      where id = new.anon_session_id;
  end if;
  return new;
end;
$$;

create trigger inquiries_extend_anon_expiry after insert on public.inquiries
  for each row execute function public.extend_anon_session_expiry();

-- 파기 배치: 기한이 지난 질문(결과·인용·피드백·추가 질문은 연쇄 삭제), 질문이 남지 않은 익명 세션,
-- 30일 지난 비로그인 사용 기록, 하루 지난 레이트 리밋 카운터. 감사 로그(append-only)는 지우지 않는다
create or replace function public.purge_expired_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inquiries int;
  v_sessions int;
  v_usage int;
  v_rate int;
begin
  delete from public.inquiries where expires_at < now();
  get diagnostics v_inquiries = row_count;
  delete from public.anon_sessions s
    where s.expires_at < now()
      and not exists (select 1 from public.inquiries i where i.anon_session_id = s.id);
  get diagnostics v_sessions = row_count;
  delete from public.anon_usage where used_at < now() - interval '30 days';
  get diagnostics v_usage = row_count;
  delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  get diagnostics v_rate = row_count;
  insert into public.audit_logs (actor_id, actor_role, action, target_table)
    values (null, null, 'retention_purge', 'inquiries');
  return jsonb_build_object(
    'inquiries', v_inquiries, 'anon_sessions', v_sessions,
    'anon_usage', v_usage, 'rate_limit_hits', v_rate
  );
end;
$$;

revoke execute on function public.purge_expired_records() from public, anon, authenticated;
grant execute on function public.purge_expired_records() to service_role;

-- 매일 03:17 UTC(12:17 KST) 파기. Supabase 무료 플랜에서 쓸 수 있는 pg_cron
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('hz-retention-purge', '17 3 * * *', 'select public.purge_expired_records()');
