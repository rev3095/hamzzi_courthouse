-- 검색으로 만든 AI 결과 저장·재사용 (DEC-076, 2026-11-27 사용자 결정).
-- 판례·법령 검색('물어보기')의 AI 답(해석·요약·쓰이는 곳·성립 조건·쟁점·가상 사례·찾은 법령·판례 목록)과
-- 법령 쉬운 설명(요약·핵심 내용·성립 요건·대안·가상 사례)을 같은 검색어·같은 법령이면 다시 쓰고, 새 내용이 오면 덧붙인다.
-- 사용자의 개인 데이터가 아니다: 요청자(계정·세션·IP)를 담지 않는다. 키는 서버가 scanInput으로 개인정보 꼴이 없음을 확인한
-- 검색어(정규화)이거나 공개 법령 이름이다 — 개인정보로 보이는 검색어는 저장·재사용하지 않는다(lib/search/answer/store.ts).
-- 판례 전문은 담지 않는다(DEC-007): 판례는 법제처 일련번호·사건번호·사건명·법원·선고일·주소만.
create table public.generated_results (
  id uuid primary key default gen_random_uuid(),
  -- search(검색 화면 답) · research(리서치 브리프) · law_easy(법령 쉬운 설명)
  kind text not null check (kind in ('search', 'research', 'law_easy')),
  -- 정규화한 검색어(+자료 종류) 또는 법령 이름
  key text not null check (char_length(key) between 1 and 160),
  payload jsonb not null check (pg_column_size(payload) <= 65536),
  -- 결과를 만든 지시문 판 (lib/ai/search-answer.ts·law-easy.ts). 판이 오르면 빠진 항목만 새로 채워 덧붙인다
  prompt_version text not null check (char_length(prompt_version) between 1 and 60),
  hits int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, key)
);

create index generated_results_updated_idx on public.generated_results (kind, updated_at desc);

comment on table public.generated_results is
  '검색으로 만든 AI 결과 (DEC-076). 요청자 정보 없음, 키는 개인정보 꼴이 없는 검색어·공개 법령 이름, 판례 전문 없음';
comment on column public.generated_results.key is
  '정규화한 검색어(scanInput 통과분만) 또는 법령 이름 — 요청자를 가리키지 않는다';

-- 서버 전용: 정책을 두지 않고 service_role만 읽고 쓴다
alter table public.generated_results enable row level security;
revoke all on public.generated_results from anon, authenticated;
grant select, insert, update on public.generated_results to service_role;

-- 다시 쓴 횟수 올리기 (한 문장으로 원자적)
create or replace function public.bump_generated_result(p_kind text, p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.generated_results set hits = hits + 1 where kind = p_kind and key = p_key;
$$;

revoke execute on function public.bump_generated_result(text, text) from public, anon, authenticated;
grant execute on function public.bump_generated_result(text, text) to service_role;
