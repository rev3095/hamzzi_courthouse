-- 내 기록 삭제 감사 로그에서 IP 해시를 뺀다 (PRD 9.2 데이터 최소화, legal-reviewer 지적 2026-11-01).
-- audit_logs는 append-only라 계속 남으므로, 삭제 기록에는 행위·세션 ID·시각만 남긴다.
-- 참고: purge_expired_records에서 이어 묻기 질문은 연쇄 삭제가 아니라(parent_inquiry_id on delete set null)
-- 각자의 30일 기한에 지워진다.
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
  delete from public.inquiries where anon_session_id = p_session and user_id is null;
  get diagnostics v_count = row_count;
  -- p_ip_hash는 호출 호환을 위해 받기만 하고 저장하지 않는다
  insert into public.audit_logs (actor_id, actor_role, action, target_table, target_id, ip_hash)
    values (p_session, null, 'anon_data_deleted', 'anon_sessions', p_session, null);
  return v_count;
end;
$$;

revoke execute on function public.delete_anon_data(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_anon_data(uuid, text) to service_role;
