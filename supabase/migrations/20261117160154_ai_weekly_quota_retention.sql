-- 유료 분석 주간 상한 (DEC-026, 2026-11-18 사용자 요청: Max 월 $100 프로모션 크레딧을 다 쓸 수 있게).
-- lib/auth/rate-limit.ts의 `ai_weekly` 버킷은 7일 창이라, 레이트 리밋 카운터를 하루만 남기면
-- 파기 배치가 주간 카운터를 매일 지워 주간 상한이 듣지 않는다. 보유 기간을 1일 → 8일로 늘린다.
-- 테이블·권한은 바꾸지 않는다. 카운터 키는 해시(또는 'global')만 저장한다 (원본 IP 금지 그대로).
-- 함수 본문은 20261101032339_demo_ops_retention.sql과 같고 rate_limit_hits 줄만 다르다.
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
  -- 가장 긴 창(주간 7일)이 끝난 뒤에만 지운다
  delete from public.rate_limit_hits where window_start < now() - interval '8 days';
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
