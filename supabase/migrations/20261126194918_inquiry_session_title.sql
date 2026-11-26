-- 내 세션 이름 (DEC-070 ②, 2026-11-27 사용자 요청): 로그인 사용자가 사이드바의 내 세션에서 질문 세션 이름을 바꾼다.
-- 비우면(null) 목록은 가린 질문 문장을 보인다. 서버가 scanInput으로 개인정보 꼴을 가린 뒤에만 저장한다 [PII-S].
-- 쓰기는 기존처럼 서버(service_role)만 한다 — RLS 정책 변경 없음.
alter table public.inquiries
  add column if not exists session_title text
    check (session_title is null or char_length(session_title) between 1 and 60);

comment on column public.inquiries.session_title is
  '내 세션에 보이는 이름 (DEC-070). 사용자가 바꾼 이름의 마스킹본, 없으면 null';
