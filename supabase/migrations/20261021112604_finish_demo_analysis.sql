-- 데모 분석 마무리 (P5, DEC-010, F-005, API.md 4.1)
-- 비로그인 횟수 차감 · 결과 저장 · 인용 저장 · 질문 상태 변경을 한 트랜잭션에서 처리한다.
-- - 같은 질문에 동시에 온 두 요청: inquiries 행 잠금으로 직렬화하고, 뒤의 요청은 already_analyzed (이중 차감·결과 중복 없음)
-- - 저장 중 하나라도 실패하면 횟수 차감까지 함께 되돌린다 (결과 없이 횟수만 줄지 않음)
-- 반환: {"status": "ok", "resultId": uuid} | {"status": "already_analyzed" | "unknown_inquiry" | "not_owner" | consume_anon_question 결과}

create or replace function public.finish_demo_analysis(
  p_inquiry uuid,
  p_anon_session uuid,          -- 비로그인이면 익명 세션, 로그인 사용자면 null (차감 없음)
  p_ip_hash text,
  p_session_limit int,
  p_ip_limit int,
  p_window interval,
  p_response jsonb,             -- 인용 검증(F-005)을 통과한 결과만
  p_outcome public.analysis_outcome,
  p_model text,
  p_prompt_version text,
  p_tokens_in int,
  p_tokens_out int,
  p_latency_ms int,
  p_citations_total int,
  p_citations_removed int,
  p_citations jsonb             -- [{kind, claimed_ref, status, source, source_ref, quote}]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur record;
  consumed text;
  rid uuid;
begin
  if jsonb_typeof(p_citations) is distinct from 'array' then
    raise exception 'citations must be an array';
  end if;

  select status, anon_session_id, user_id into cur
    from public.inquiries where id = p_inquiry for update;
  if not found then
    return jsonb_build_object('status', 'unknown_inquiry');
  end if;
  if cur.status = 'analyzed' then
    return jsonb_build_object('status', 'already_analyzed');
  end if;

  if p_anon_session is not null then
    if cur.user_id is not null or cur.anon_session_id is distinct from p_anon_session then
      return jsonb_build_object('status', 'not_owner');
    end if;
    consumed := public.consume_anon_question(
      p_anon_session, p_ip_hash, p_session_limit, p_ip_limit, p_window
    );
    if consumed <> 'ok' then
      return jsonb_build_object('status', consumed);
    end if;
  end if;

  insert into public.analysis_results (
    inquiry_id, response, outcome, model, prompt_version,
    tokens_in, tokens_out, latency_ms, citations_total, citations_removed
  ) values (
    p_inquiry, p_response, p_outcome, p_model, p_prompt_version,
    p_tokens_in, p_tokens_out, p_latency_ms, p_citations_total, p_citations_removed
  ) returning id into rid;

  insert into public.result_citations (result_id, kind, claimed_ref, status, source, source_ref, quote)
  select rid, c.kind::public.citation_kind, c.claimed_ref, c.status::public.citation_status,
         c.source, c.source_ref, c.quote
    from jsonb_to_recordset(p_citations)
      as c(kind text, claimed_ref text, status text, source text, source_ref text, quote text);

  update public.inquiries set status = 'analyzed' where id = p_inquiry;
  return jsonb_build_object('status', 'ok', 'resultId', rid);
end;
$$;

revoke execute on function public.finish_demo_analysis(
  uuid, uuid, text, int, int, interval, jsonb, public.analysis_outcome, text, text,
  int, int, int, int, int, jsonb
) from public, anon, authenticated;
grant execute on function public.finish_demo_analysis(
  uuid, uuid, text, int, int, interval, jsonb, public.analysis_outcome, text, text,
  int, int, int, int, int, jsonb
) to service_role;
