-- DEC-055 자료 첨부 (F-017): 질문과 함께 보낸 자료 사진의 판독 정리(개인정보를 가린 것)를 질문 행에 둔다.
--
-- 개인정보: materials에는 사진에서 읽은 자료 종류·내용 요약·적힌 날짜/금액/문구·읽지 못한 곳이 들어간다.
-- 서버가 저장 전에 scanInput + 이름·번호 꼴 추가 가림을 다시 걸고, 조문·사건번호·결과를 말하는 문장은 뺀다 (masked_text와 같은 [PII-M]).
-- 사진과 판독 원문은 저장하지 않는다 (절대 규칙 4 예외 하나, DEC-052·055).
-- 보유·삭제는 질문 행과 같다 (expires_at, 연쇄 삭제). 읽기는 기존 inquiries 정책 그대로(본인 행).

alter table public.inquiries
  add column materials jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(materials) = 'array'
      and jsonb_array_length(materials) <= 30
      and octet_length(materials::text) <= 40000
    );

comment on column public.inquiries.materials is
  '[PII-M] 첨부 자료 판독 정리(DEC-055): [{kind, summary, details[], gaps[]}] — 개인정보를 가린 것만. 사진·판독 원문은 저장하지 않는다';
