-- DEC-047 커뮤니티(게시글·댓글) + 씨앗(활동 포인트).
--
-- 개인정보: 글·댓글 본문은 서버가 개인정보 패턴을 가린 마스킹본만 넣는다(원문 저장 없음, 절대 규칙 4).
-- 비로그인 글의 비밀번호는 scrypt 해시만 저장한다. IP는 저장하지 않는다(쓰기 횟수는 rate_limit_hits의 솔트 해시로만 센다).
-- 쓰기·읽기는 모두 서버(service_role)가 한다 — 정책을 두지 않아 anon·authenticated는 직접 접근하지 못한다.

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  board text not null check (board in ('free', 'opinion', 'whatif', 'story', 'tips', 'feedback')),
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 2 and 6000),
  nickname text not null check (char_length(nickname) between 2 and 12),
  -- 로그인 글이면 계정, 비로그인 글이면 비밀번호 해시 — 둘 중 하나만
  user_id uuid references auth.users (id) on delete cascade,
  pass_hash text,
  comment_count int not null default 0,
  report_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check ((user_id is null) <> (pass_hash is null))
);

create index community_posts_list_idx on public.community_posts (created_at desc);
create index community_posts_board_idx on public.community_posts (board, created_at desc);
create index community_posts_user_idx on public.community_posts (user_id) where user_id is not null;

comment on table public.community_posts is '커뮤니티 게시글 (DEC-047). 본문은 마스킹본만';
comment on column public.community_posts.body is '[PII] 사용자가 쓴 글의 마스킹본. 원문은 저장하지 않는다';
comment on column public.community_posts.pass_hash is '비로그인 글 수정·삭제용 비밀번호의 scrypt 해시 (평문 저장 금지)';

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1500),
  nickname text not null check (char_length(nickname) between 2 and 12),
  user_id uuid references auth.users (id) on delete cascade,
  pass_hash text,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (pass_hash is null))
);

create index community_comments_post_idx on public.community_comments (post_id, created_at);
create index community_comments_user_idx on public.community_comments (user_id) where user_id is not null;

comment on table public.community_comments is '커뮤니티 댓글 (DEC-047). 본문은 마스킹본만';
comment on column public.community_comments.body is '[PII] 사용자가 쓴 댓글의 마스킹본';
comment on column public.community_comments.pass_hash is '비로그인 댓글 삭제용 비밀번호의 scrypt 해시';

-- 댓글 수는 트리거가 맞춘다 (글이 지워져 댓글이 함께 지워질 때는 갱신할 행이 없어 그냥 지나간다)
create or replace function public.community_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  end if;
  update public.community_posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

create trigger community_comment_count_trg
  after insert or delete on public.community_comments
  for each row execute function public.community_comment_count();

-- 씨앗 장부: 한 줄이 한 번의 적립·회수·사용. 잔액은 합계다. 로그인 사용자만 쌓인다.
create table public.seed_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('post', 'comment', 'revoke', 'redeem', 'adjust')),
  amount int not null check (amount <> 0),
  -- 적립·회수의 대상 글·댓글
  ref_id uuid,
  -- 하루 적립 횟수 상한을 세는 날짜 (한국 시간)
  earned_day date not null default ((now() at time zone 'Asia/Seoul')::date),
  created_at timestamptz not null default now()
);

create unique index seed_ledger_once_idx on public.seed_ledger (user_id, kind, ref_id) where ref_id is not null;
create index seed_ledger_user_idx on public.seed_ledger (user_id, created_at desc);

comment on table public.seed_ledger is '씨앗(커뮤니티 활동 포인트) 장부 (DEC-047). 사용(redeem)은 과금 게이트 승인 전까지 쓰지 않는다';

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.seed_ledger enable row level security;
revoke all on public.community_posts, public.community_comments, public.seed_ledger from anon, authenticated;
grant select, insert, update, delete on public.community_posts, public.community_comments to service_role;
grant select, insert on public.seed_ledger to service_role;

-- 씨앗 적립: 같은 글·댓글에는 한 번만, 종류별 하루 p_daily_limit번까지. 적립한 양(없으면 0)을 돌려준다.
create or replace function public.award_seeds(
  p_user uuid,
  p_kind text,
  p_ref uuid,
  p_amount int,
  p_daily_limit int
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_count int;
  v_id bigint;
begin
  if p_kind not in ('post', 'comment') or p_amount < 1 or p_daily_limit < 1 or p_ref is null then
    raise exception 'invalid seed award';
  end if;
  -- 같은 사용자의 동시 요청이 하루 상한을 넘기지 않게 줄을 세운다
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 47));
  select count(*) into v_count from public.seed_ledger
    where user_id = p_user and kind = p_kind and earned_day = v_day;
  if v_count >= p_daily_limit then
    return 0;
  end if;
  insert into public.seed_ledger (user_id, kind, amount, ref_id, earned_day)
    values (p_user, p_kind, p_amount, p_ref, v_day)
    on conflict do nothing
    returning id into v_id;
  if v_id is null then
    return 0;
  end if;
  return p_amount;
end;
$$;

-- 씨앗 회수: 글·댓글을 지우면 그 글로 받은 씨앗을 되돌린다 (쓰고 지우기 되풀이 방지). 회수한 양을 돌려준다.
create or replace function public.revoke_seeds(p_user uuid, p_ref uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount int;
  v_id bigint;
begin
  select coalesce(sum(amount), 0) into v_amount from public.seed_ledger
    where user_id = p_user and ref_id = p_ref and kind in ('post', 'comment');
  if v_amount < 1 then
    return 0;
  end if;
  insert into public.seed_ledger (user_id, kind, amount, ref_id)
    values (p_user, 'revoke', -v_amount, p_ref)
    on conflict do nothing
    returning id into v_id;
  if v_id is null then
    return 0;
  end if;
  return v_amount;
end;
$$;

-- 씨앗 요약: 잔액, 오늘 종류별 적립 횟수
create or replace function public.seed_summary(p_user uuid)
returns table (balance bigint, posts_today bigint, comments_today bigint)
language sql
security definer
set search_path = ''
as $$
  select
    coalesce(sum(amount), 0),
    count(*) filter (where kind = 'post' and earned_day = (now() at time zone 'Asia/Seoul')::date),
    count(*) filter (where kind = 'comment' and earned_day = (now() at time zone 'Asia/Seoul')::date)
  from public.seed_ledger
  where user_id = p_user;
$$;

-- 신고 수 올리기 (한 문장으로 원자적). 없는 글이면 false
create or replace function public.report_community_post(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.community_posts set report_count = report_count + 1 where id = p_id;
  return found;
end;
$$;

revoke execute on function public.award_seeds(uuid, text, uuid, int, int) from public, anon, authenticated;
revoke execute on function public.revoke_seeds(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.seed_summary(uuid) from public, anon, authenticated;
revoke execute on function public.report_community_post(uuid) from public, anon, authenticated;
revoke execute on function public.community_comment_count() from public, anon, authenticated;
grant execute on function public.award_seeds(uuid, text, uuid, int, int) to service_role;
grant execute on function public.revoke_seeds(uuid, uuid) to service_role;
grant execute on function public.seed_summary(uuid) to service_role;
grant execute on function public.report_community_post(uuid) to service_role;
