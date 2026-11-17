-- 비로그인 질문 하루 3회 (DEC-024, 2026-11-17 사용자 결정). 이전에는 세션당 평생 3회(DEC-010)였다.
-- 한국 시간(Asia/Seoul) 날짜가 바뀌면 그 세션의 questions_used를 0으로 되돌린 뒤 센다.
-- 같은 IP 해시 24시간 10회 상한(anon_usage)은 그대로 — 쿠키를 지워 가며 쓰는 것을 막는다.

-- 1) 횟수를 센 날짜 (한국 시간). null = 아직 센 적 없음 → 다음 소비 때 오늘로 맞춘다
alter table public.anon_sessions add column quota_day date;
comment on column public.anon_sessions.quota_day is
  'questions_used를 센 날짜(Asia/Seoul). 날짜가 바뀌면 consume_anon_question이 0으로 되돌린다 (DEC-024)';
comment on column public.anon_sessions.questions_used is
  '그날(quota_day) 쓴 질문 수 0~3 (DEC-024). consume_anon_question만 올린다';

-- 2) 같은 시그니처로 바꾼다 — finish_demo_analysis가 그대로 부른다
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
  day date;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_session_limit < 1 or p_ip_limit < 1 or p_window <= interval '0' then
    raise exception 'invalid limits';
  end if;

  select questions_used, quota_day into used, day
    from public.anon_sessions where id = p_session for update;
  if not found then
    return 'unknown_session';
  end if;
  -- 날짜가 바뀌었으면 그날 횟수는 0부터
  if day is distinct from today then
    used := 0;
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
    set questions_used = used + 1,
        quota_day = today,
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
