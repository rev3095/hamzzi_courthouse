-- DEC-053 사건 진행 (F-016): 로그인 사용자가 본인 사건의 자료를 정리해 두는 공간.
--
-- 개인정보: data에는 사용자가 올린 서류에서 읽은 사실·당사자(상대방 포함)의 이름과 사용자가 적은 메모가 들어간다.
-- 본인 사건을 정리하는 도구라 이름을 가리지 않는다(사용자 결정 2026-11-24, DEC-006 "마스킹본만 저장"의 예외).
-- 연락처·등록번호·계좌·주소 꼴은 서버가 저장 전에 가린다. 서류 사진은 저장하지 않는다.
-- 읽기·쓰기는 모두 서버(service_role)가 하고 모든 질의에 user_id를 건다 — 정책을 두지 않아 anon·authenticated는 직접 접근하지 못한다.
-- 보유: 사용자가 지울 때까지. 계정이 삭제되면 함께 삭제된다.

create table public.matters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 600000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index matters_user_idx on public.matters (user_id, updated_at desc);

comment on table public.matters is '사건 진행 (DEC-053, F-016). 로그인 사용자 본인만 서버를 거쳐 읽고 쓴다';
comment on column public.matters.title is '[PII-S] 사용자가 붙인 사건 이름';
comment on column public.matters.data is
  '[PII-S] 사건 자료(JSON): 서류에서 읽은 사실·당사자 이름·요구·조항, 쟁점, 메모, 조사 내용. 서류 사진과 연락처·등록번호는 담지 않는다';

alter table public.matters enable row level security;
revoke all on public.matters from anon, authenticated;
grant select, insert, update, delete on public.matters to service_role;
