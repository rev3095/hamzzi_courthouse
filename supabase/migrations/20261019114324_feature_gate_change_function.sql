-- F-013 게이트 상태 변경 함수 (API.md PATCH /admin/feature-gates/{key})
-- 상태 변경, gate_changes 이력, audit_logs 기록을 한 트랜잭션으로 묶는다.
-- feature_gates는 이 함수를 거쳐서만 바꿀 수 있다(트리거). 그래서 모든 변경이 gate_changes에 남는다.

create or replace function public.change_feature_gate(
  p_key text,
  p_status public.gate_status,
  p_conditions jsonb,
  p_review_ref text,
  p_reason text,
  p_actor uuid
)
returns setof public.feature_gates
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur public.feature_gates;
  ref text;
begin
  if p_actor is null or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'actor and reason are required';
  end if;
  if jsonb_typeof(p_conditions) is distinct from 'array' then
    raise exception 'conditions must be an array';
  end if;

  select * into cur from public.feature_gates where feature_key = p_key for update;
  if not found then
    raise exception 'unknown feature gate';
  end if;
  -- 빈 reviewRef는 기존 검토 기록을 유지한다
  ref := coalesce(nullif(btrim(coalesce(p_review_ref, '')), ''), cur.review_ref);

  -- 승인 조건: 검토 기록이 있고 모든 조건이 해결됨 (F-013 AC2). 앱(lib/gate/policy.ts)과 같은 규칙을 DB에서도 강제한다
  if p_status = 'approved' and (
    ref is null
    or exists (
      select 1 from jsonb_array_elements(p_conditions) c
      where coalesce((c ->> 'resolved')::boolean, false) is not true
    )
    -- 승인 요청으로 기존 조건 항목을 지울 수 없다 (삭제로 승인 우회 방지)
    or exists (
      select 1 from jsonb_array_elements(cur.conditions) old
      where not exists (
        select 1 from jsonb_array_elements(p_conditions) c
        where c ->> 'item' = old ->> 'item'
      )
    )
  ) then
    raise exception 'approval requires review_ref and all conditions resolved';
  end if;

  insert into public.gate_changes (feature_key, from_status, to_status, actor_id, reason)
  values (p_key, cur.status, p_status, p_actor, btrim(p_reason));

  insert into public.audit_logs (actor_id, actor_role, action, target_table)
  values (p_actor, 'admin', 'feature_gate.change', 'feature_gates');

  perform set_config('app.gate_change', 'on', true);
  update public.feature_gates set
    status = p_status,
    conditions = p_conditions,
    review_ref = ref,
    approved_by = case when p_status = 'approved' then p_actor end,
    approved_at = case when p_status = 'approved' then now() end
  where feature_key = p_key
  returning * into cur;
  perform set_config('app.gate_change', 'off', true);
  return next cur;
end;
$$;

revoke execute on function public.change_feature_gate(text, public.gate_status, jsonb, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.change_feature_gate(text, public.gate_status, jsonb, text, text, uuid)
  to service_role;

-- change_feature_gate 밖에서의 상태 변경·삭제를 막는다 (service_role 포함)
create or replace function public.guard_feature_gates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- 새 게이트 키는 마이그레이션으로 pending_review 상태로만 추가한다
    if new.status <> 'pending_review' then
      raise exception 'new feature gates must start as pending_review';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'feature_gates rows cannot be deleted';
  end if;
  if current_setting('app.gate_change', true) is distinct from 'on' then
    raise exception 'use change_feature_gate() to modify feature_gates';
  end if;
  return new;
end;
$$;

create trigger feature_gates_guard before insert or update or delete on public.feature_gates
  for each row execute function public.guard_feature_gates();
create trigger feature_gates_no_truncate before truncate on public.feature_gates
  for each statement execute function public.forbid_mutation();
