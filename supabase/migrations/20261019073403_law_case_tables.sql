-- DATA_MODEL.md 2절: 법령·판례 공공 데이터 테이블 (F-003, F-004, PRD 9.1·9.3)
-- 쓰기는 수집기 서비스 계정(service_role, RLS 우회)만 한다. 일반 사용자는 읽기만 (DATA_MODEL 6절).
-- 보류: case_chunks.embedding / HNSW 인덱스는 임베딩 차원 확정(OQ-ARC-03) 후 별도 마이그레이션으로 추가한다.

create type public.deid_status as enum ('pending', 'passed', 'flagged');
create type public.case_section as enum ('holding', 'order', 'reasoning', 'facts');
create type public.ingest_status as enum ('running', 'ok', 'partial', 'failed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- court_cases — 판례 [PUB]
create table public.court_cases (
  id uuid primary key default gen_random_uuid(),
  case_no text not null,
  court text not null,
  decided_at date,
  case_name text,
  case_type text,
  holding_summary text,
  full_text text,
  source text not null,
  source_id text not null,
  source_url text,
  collected_at timestamptz not null default now(),
  content_hash text not null,
  deid_check public.deid_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id),
  unique (case_no, court)
);
create index court_cases_decided_at_idx on public.court_cases (decided_at);
create index court_cases_case_type_idx on public.court_cases (case_type);

comment on column public.court_cases.holding_summary is '[PUB] 판결요지(원천 제공분), 비식별 재검사 대상';
comment on column public.court_cases.full_text is '[PUB] 판례 전문 — OQ-DM-05 확정 전까지 수집기가 채우지 않는다';
comment on column public.court_cases.deid_check is 'passed만 사용자에게 노출·검색 (pending·flagged 제외)';

-- case_chunks — 검색 단위
create table public.case_chunks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.court_cases (id) on delete cascade,
  section public.case_section not null,
  ord int not null,
  text text not null,
  -- 형태소 분석 방식 확정(OQ-ARC-04) 전까지 'simple' 구성 사용
  tsv tsvector generated always as (to_tsvector('simple', text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index case_chunks_tsv_idx on public.case_chunks using gin (tsv);
create index case_chunks_case_ord_idx on public.case_chunks (case_id, ord);

comment on column public.case_chunks.text is '[PUB] 청크 본문';

-- statutes — 법령 조문 (버전별 1행)
create table public.statutes (
  id uuid primary key default gen_random_uuid(),
  law_id text not null,
  law_name text not null,
  article_no text not null,
  article_title text,
  body text not null,
  effective_from date not null,
  effective_to date,
  source_url text,
  version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (law_id, article_no, effective_from),
  check (effective_to is null or effective_to > effective_from)
);
create index statutes_law_name_article_idx on public.statutes (law_name, article_no);
create index statutes_current_idx on public.statutes (law_id, article_no) where effective_to is null;

comment on column public.statutes.body is '[PUB] 조문 본문';
comment on column public.statutes.effective_to is '다음 버전의 시행일(이 날부터 효력 없음), 현행이면 null';

-- case_statute_refs — 판례가 인용한 법령
create table public.case_statute_refs (
  case_id uuid not null references public.court_cases (id) on delete cascade,
  statute_id uuid references public.statutes (id) on delete set null,
  raw_ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (case_id, raw_ref)
);
create index case_statute_refs_statute_idx on public.case_statute_refs (statute_id);

-- ingest_runs — 수집 이력 (PRD 9.3)
create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched int not null default 0,
  inserted int not null default 0,
  updated int not null default 0,
  failed int not null default 0,
  status public.ingest_status not null default 'running',
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ingest_runs_source_started_idx on public.ingest_runs (source, started_at desc);

comment on column public.ingest_runs.error_summary is '오류 유형·건수만 기록. 인증키·요청 URL 금지';

-- updated_at 트리거
create trigger court_cases_updated_at before update on public.court_cases
  for each row execute function public.set_updated_at();
create trigger case_chunks_updated_at before update on public.case_chunks
  for each row execute function public.set_updated_at();
create trigger statutes_updated_at before update on public.statutes
  for each row execute function public.set_updated_at();
create trigger case_statute_refs_updated_at before update on public.case_statute_refs
  for each row execute function public.set_updated_at();
create trigger ingest_runs_updated_at before update on public.ingest_runs
  for each row execute function public.set_updated_at();

-- RLS (DATA_MODEL 6절): 로그인 사용자 읽기, 쓰기 정책 없음(service_role만).
-- 판례는 비식별 재검사를 통과한 행(deid_check = 'passed')만 보인다. pending·flagged는 숨긴다.
-- 비로그인 질문(DEC-005)은 서버가 service_role로 검색하므로 anon에 직접 읽기를 열지 않는다.
-- 주의: service_role은 RLS를 우회한다 → 서버 검색 쿼리(lib/search)가 deid_check = 'passed'를 직접 건다.
alter table public.court_cases enable row level security;
alter table public.case_chunks enable row level security;
alter table public.statutes enable row level security;
alter table public.case_statute_refs enable row level security;
alter table public.ingest_runs enable row level security;

create policy court_cases_read on public.court_cases
  for select to authenticated using (deid_check = 'passed');

create policy case_chunks_read on public.case_chunks
  for select to authenticated using (
    exists (
      select 1 from public.court_cases c
      where c.id = case_chunks.case_id and c.deid_check = 'passed'
    )
  );

create policy statutes_read on public.statutes
  for select to authenticated using (true);

create policy case_statute_refs_read on public.case_statute_refs
  for select to authenticated using (
    exists (
      select 1 from public.court_cases c
      where c.id = case_statute_refs.case_id and c.deid_check = 'passed'
    )
  );

-- ingest_runs: 관리자 읽기 정책은 profiles(역할) 테이블 생성 시 추가한다. 그 전까지 service_role 전용.
