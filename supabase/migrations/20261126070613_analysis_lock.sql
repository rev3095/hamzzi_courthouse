-- 분석 잠금 (DEC-065): 분석이 진행 중인 질문을 표시한다. 새로고침·재접속으로 같은 질문의 유료 분석이 두 번 돌지 않게,
-- 서버는 분석 시작 전에 이 값을 조건부 update로 잡고(비어 있거나 오래된 때만), 이미 잡혀 있으면 409로 돌려보낸다.
-- 화면은 그때 새 분석을 시작하지 않고 결과가 저장될 때까지 기다렸다가 읽는다.
-- 개인정보가 아니다 (시각 하나). 쓰기는 기존처럼 서버(service_role)만 한다 — RLS 정책 변경 없음.
alter table public.inquiries
  add column if not exists analysis_started_at timestamptz;

comment on column public.inquiries.analysis_started_at is
  '분석 잠금 시각 (DEC-065). 분석 라우트 한도(300초)보다 오래되면 풀린 것으로 본다. 실패하면 비운다';
