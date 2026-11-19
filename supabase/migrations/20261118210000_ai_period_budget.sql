-- DEC-040 기간 예산 (2026-11-19 사용자 결정): 2026-11-25까지 유료 분석 전체 상한을 주간 창이 아니라
-- 정해진 기간 하나로 세고($95), 상한이 아니라 실제로 쓴 금액만 차감한다.
--
-- 방식: 호출 전에 그 호출의 상한만큼 먼저 잡아 두고(reserve), 답변 뒤 실제 비용과의 차액을 돌려준다(settle).
-- 먼저 잡아 두므로 동시에 여러 요청이 와도 합계가 상한을 넘는 호출은 나가지 않는다.
-- 카운터는 기존 rate_limit_hits 표를 쓴다. 금액 단위는 100만분의 1달러(정수). 키는 'global'만 쓴다 (개인정보 없음).
-- 창 시작(window_start)은 date_bin이 아니라 서버가 넘기는 기간 시작 시각이다 — 기간 중에 창이 바뀌지 않는다.
-- 파기 배치는 window_start가 8일 지난 행을 지우므로 기간은 8일을 넘기지 않는다 (서버 단위 테스트가 확인).

create or replace function public.reserve_ai_budget(
  p_bucket text,
  p_start timestamptz,
  p_limit int,
  p_amount int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits int;
begin
  if p_limit < 1 or p_amount < 1 or p_start is null or coalesce(p_bucket, '') = '' then
    raise exception 'invalid ai budget';
  end if;
  insert into public.rate_limit_hits as r (bucket, key_hash, window_start, hits)
    values (p_bucket, 'global', p_start, p_amount)
    on conflict (bucket, key_hash, window_start) do update set hits = r.hits + p_amount
    returning hits into v_hits;
  if v_hits > p_limit then
    -- 넘은 요청은 되돌린다: 큰 요청이 막혀도 남은 금액으로 작은 요청은 계속 받을 수 있게
    update public.rate_limit_hits set hits = hits - p_amount
      where bucket = p_bucket and key_hash = 'global' and window_start = p_start;
    return false;
  end if;
  return true;
end;
$$;

-- 잡아 둔 금액 중 쓰지 않은 몫을 돌려준다. 0 아래로 내려가지 않는다. 행이 없으면 아무 일도 하지 않는다.
create or replace function public.settle_ai_budget(
  p_bucket text,
  p_start timestamptz,
  p_refund int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_refund < 1 or p_start is null or coalesce(p_bucket, '') = '' then
    raise exception 'invalid ai budget';
  end if;
  update public.rate_limit_hits set hits = greatest(hits - p_refund, 0)
    where bucket = p_bucket and key_hash = 'global' and window_start = p_start;
end;
$$;

revoke execute on function public.reserve_ai_budget(text, timestamptz, int, int) from public, anon, authenticated;
grant execute on function public.reserve_ai_budget(text, timestamptz, int, int) to service_role;
revoke execute on function public.settle_ai_budget(text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.settle_ai_budget(text, timestamptz, int) to service_role;
