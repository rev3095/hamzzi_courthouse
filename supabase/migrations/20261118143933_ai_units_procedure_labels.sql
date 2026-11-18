-- DEC-036 답변 단계(Light·Pro·Pro Max) + DEC-037 AI 절차 분류 라벨 + DEC-039 내 질문 기록.
--
-- 1) hit_rate_limit_weighted — 주간 유료 예산을 건수가 아니라 단위($0.0015)로 센다.
--    단계마다 값이 달라(Light 1 · Pro 20 · Pro Max 94) 한 번에 여러 단위를 올려야 한다.
--    기존 hit_rate_limit(1씩 세기)은 그대로 둔다. 카운터 키는 해시 또는 'global'만 (원본 IP 금지 그대로).
create or replace function public.hit_rate_limit_weighted(
  p_bucket text,
  p_key text,
  p_limit int,
  p_window interval,
  p_weight int
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
  if p_limit < 1 or p_weight < 1 or p_window <= interval '0'
     or coalesce(p_bucket, '') = '' or coalesce(p_key, '') = '' then
    raise exception 'invalid rate limit';
  end if;
  insert into public.rate_limit_hits as r (bucket, key_hash, window_start, hits)
    values (p_bucket, p_key, v_start, p_weight)
    on conflict (bucket, key_hash, window_start) do update set hits = r.hits + p_weight
    returning hits into v_hits;
  if v_hits > p_limit then
    -- 넘은 요청은 되돌린다: 큰 요청 하나가 막혀도 남은 예산으로 작은 요청은 계속 받을 수 있게
    update public.rate_limit_hits set hits = hits - p_weight
      where bucket = p_bucket and key_hash = p_key and window_start = v_start;
    return false;
  end if;
  return true;
end;
$$;

revoke execute on function public.hit_rate_limit_weighted(text, text, int, interval, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit_weighted(text, text, int, interval, int) to service_role;

-- 2) procedure_labels — 규칙이 절차를 정하지 못한 질문을 AI가 분류한 결과 (DEC-037).
--    같은 낱말의 질문이 다시 오면 이 표를 먼저 보고 AI를 다시 부르지 않는다.
--    개인정보 없음: 질문 문장은 저장하지 않는다. 일반 낱말(keywords)·절차 이름·단계 문구만 담고,
--    서버가 저장 전에 숫자·개인정보 패턴을 검사한다 (lib/procedure/labels.ts).
create table public.procedure_labels (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 40),
  -- 질문에서 찾을 일반 낱말 (이름·숫자 금지)
  keywords text[] not null check (cardinality(keywords) between 1 and 5),
  -- 검증해 둔 기존 타임라인 키 (lib/procedure TRACKS·LIFE_TRACKS). 맞는 것이 없으면 null
  track text,
  -- 기존 타임라인이 없을 때 AI가 제안한 단계 초안. 운영자가 승인해야 화면에 나간다
  steps jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  hits int not null default 0,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check ((track is null) <> (steps is null))
);

create index procedure_labels_status_idx on public.procedure_labels (status, created_at desc);

comment on table public.procedure_labels is 'AI 절차 분류 라벨 (DEC-037). 개인정보·질문 문장 없음';

-- 서버 전용: 정책을 두지 않고 service_role만 읽고 쓴다
alter table public.procedure_labels enable row level security;
revoke all on public.procedure_labels from anon, authenticated;
grant select, insert, update on public.procedure_labels to service_role;

-- 3) 라벨 사용 횟수 올리기 (한 문장으로 원자적)
create or replace function public.bump_procedure_label(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.procedure_labels set hits = hits + 1 where id = p_id;
$$;

revoke execute on function public.bump_procedure_label(uuid) from public, anon, authenticated;
grant execute on function public.bump_procedure_label(uuid) to service_role;

-- 4) 내 질문 기록 (DEC-039). 로그인 사용자가 "기록에 남기기"를 고른 질문만 마이페이지 목록에 보인다.
--    새 개인정보는 없다 — 이미 있는 마스킹본 행에 표시 하나를 더할 뿐이고 보유 기간(expires_at)도 그대로다.
alter table public.inquiries add column saved boolean not null default false;
comment on column public.inquiries.saved is '로그인 사용자가 내 질문 기록에 남기기로 한 질문 (DEC-039)';
create index inquiries_saved_idx on public.inquiries (user_id, created_at desc) where saved;
