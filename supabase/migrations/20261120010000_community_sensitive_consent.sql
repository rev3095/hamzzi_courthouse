-- DEC-047 보강: 커뮤니티 글·댓글의 민감정보 동의 기록 (F-007 AC2).
-- 건강·범죄경력처럼 민감한 내용으로 보이는 글은 올리는 사람이 동의해야 받는다. 동의한 시각과 정보 종류만 남긴다(내용은 담지 않는다).
alter table public.community_posts add column sensitive_consent jsonb;
alter table public.community_comments add column sensitive_consent jsonb;
comment on column public.community_posts.sensitive_consent is '민감정보 동의 기록 {at, categories}. 해당 없으면 null';
comment on column public.community_comments.sensitive_consent is '민감정보 동의 기록 {at, categories}. 해당 없으면 null';
