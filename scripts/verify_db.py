"""적용된 마이그레이션을 실제 DB에서 검증한다 (P2). Docker 없이 개발용 Supabase 프로젝트에서 실행한다.

실행: pnpm db:verify  (= uv run ... --env-file .env.local python -X utf8 scripts/verify_db.py)

- 모든 검사를 한 트랜잭션에서 돌리고 마지막에 ROLLBACK한다. 테스트 행은 DB에 남지 않는다.
- 운영 DB에서는 돌리지 않는다. 비밀값·접속 주소는 출력하지 않는다.
"""

import json
import os
import re
import sys
import uuid

import psycopg

RESULTS: list[tuple[bool, str]] = []

EXPECTED_TABLES = {
    "court_cases", "case_chunks", "statutes", "case_statute_refs", "ingest_runs",
    "profiles", "anon_sessions", "inquiries", "followup_questions", "analysis_results",
    "result_citations", "result_feedback", "feature_gates", "gate_changes", "consents",
    "audit_logs", "deletion_requests", "anon_usage", "rate_limit_hits",
}
GATE_KEYS = {
    "lawyer_verification", "brief_posting", "proposals", "billing",
    "legal_documents", "consult_agent", "procedure_guide",
}
CONSUME = "public.consume_anon_question(uuid, text, int, int, interval)"
CHANGE_GATE = "public.change_feature_gate(text, public.gate_status, jsonb, text, text, uuid)"
HIT = "public.hit_rate_limit(text, text, int, interval)"
DELETE_ANON = "public.delete_anon_data(uuid, text)"
PURGE = "public.purge_expired_records()"
FINISH = (
    "public.finish_demo_analysis(uuid, uuid, text, int, int, interval, jsonb, public.analysis_outcome, "
    "text, text, int, int, int, int, int, jsonb)"
)


def redact(text: str) -> str:
    text = re.sub(r"postgres(ql)?://\S+", "postgresql://***", text)
    return re.sub(r"(sb_secret_|sb_publishable_|eyJ)[A-Za-z0-9._-]+", r"\1***", text)


def check(ok: bool, label: str) -> None:
    RESULTS.append((ok, label))
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")


def scalar(conn, sql: str, params=None):
    return conn.execute(sql, params).fetchone()[0]


def raises(conn, label: str, sql: str, params=None, match: str | None = None) -> None:
    """sql이 오류로 막혀야 통과. 세이브포인트로 감싸 바깥 트랜잭션은 유지한다."""
    try:
        with conn.transaction():
            conn.execute(sql, params)
    except psycopg.Error as e:
        msg = str(e)
        check(match is None or match in msg, f"{label} (막힘)")
        return
    check(False, f"{label} — 막히지 않음")


def as_user(conn, uid: str | None) -> None:
    """현재 트랜잭션에서 authenticated(uid) 또는 anon 역할로 바꾼다."""
    if uid is None:
        conn.execute("set local role anon")
        conn.execute("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)")
    else:
        conn.execute("set local role authenticated")
        claims = json.dumps({"sub": uid, "role": "authenticated"})
        conn.execute("select set_config('request.jwt.claims', %s, true)", (claims,))


def make_user(conn) -> str:
    uid = str(uuid.uuid4())
    conn.execute(
        "insert into auth.users (id, aud, role, email) values (%s, 'authenticated', 'authenticated', %s)",
        (uid, f"verify-{uid[:8]}@example.test"),
    )
    return uid


def schema(conn) -> None:
    print("[1] 스키마")
    tables = {r[0] for r in conn.execute(
        "select tablename from pg_tables where schemaname = 'public'"
    )}
    missing = EXPECTED_TABLES - tables
    check(not missing, f"public 테이블 {len(EXPECTED_TABLES)}개" + (f" — 없음: {sorted(missing)}" if missing else ""))
    no_rls = [r[0] for r in conn.execute(
        "select relname from pg_class where relnamespace = 'public'::regnamespace "
        "and relkind = 'r' and not relrowsecurity"
    )]
    check(not no_rls, "모든 public 테이블 RLS 켜짐" + (f" — 꺼짐: {no_rls}" if no_rls else ""))
    write_policies = [r[0] for r in conn.execute(
        "select tablename || '.' || policyname from pg_policies "
        "where schemaname = 'public' and cmd <> 'SELECT'"
    )]
    check(not write_policies, "쓰기 정책 없음 (쓰기는 service_role만)" + (f" — {write_policies}" if write_policies else ""))
    applied = scalar(conn, "select count(*) from supabase_migrations.schema_migrations")
    local = len([f for f in os.listdir("supabase/migrations") if f.endswith(".sql")])
    check(applied == local, f"적용 기록 {applied}건 = 로컬 마이그레이션 {local}개")


def grants(conn) -> None:
    print("[2] 권한")
    for fn in (CONSUME, CHANGE_GATE, FINISH, HIT, DELETE_ANON, PURGE):
        name = fn.split("(")[0]
        for role in ("anon", "authenticated"):
            ok = not scalar(conn, "select has_function_privilege(%s, %s, 'execute')", (role, fn))
            check(ok, f"{role}는 {name} 실행 불가")
        check(scalar(conn, "select has_function_privilege('service_role', %s, 'execute')", (fn,)),
              f"service_role은 {name} 실행 가능")
    for priv in ("insert", "update", "delete"):
        ok = not scalar(conn, "select has_table_privilege('authenticated', 'public.profiles', %s)", (priv,))
        check(ok, f"authenticated는 profiles {priv} 권한 없음 (role 자가 변경 차단)")
    for priv in ("update", "delete"):
        ok = not scalar(conn, "select has_table_privilege('anon', 'public.anon_usage', %s)", (priv,))
        check(ok, f"anon은 anon_usage {priv} 권한 없음")


def gates(conn) -> None:
    print("[3] 기능 게이트 (F-013)")
    rows = dict(conn.execute("select feature_key, status::text from public.feature_gates").fetchall())
    check(set(rows) == GATE_KEYS, f"게이트 키 {len(GATE_KEYS)}개")
    check(all(s == "pending_review" for s in rows.values()), "모든 게이트 pending_review로 시작")

    raises(conn, "feature_gates 직접 update", "update public.feature_gates set status = 'approved' where feature_key = 'billing'",
           match="use change_feature_gate")
    raises(conn, "feature_gates delete", "delete from public.feature_gates where feature_key = 'billing'",
           match="cannot be deleted")
    raises(conn, "approved 상태로 새 게이트 insert",
           "insert into public.feature_gates (feature_key, status) values ('verify_tmp', 'approved')",
           match="pending_review")
    raises(conn, "feature_gates truncate", "truncate public.feature_gates cascade", match="append-only")

    actor = make_user(conn)  # 승인자는 profiles 행이 있어야 한다 (approved_by FK)
    call = f"select * from {CHANGE_GATE.split('(')[0]}(%s, %s::public.gate_status, %s::jsonb, %s, %s, %s)"
    raises(conn, "사유 없는 게이트 변경", call, ("billing", "conditional", "[]", None, " ", actor), match="reason")
    raises(conn, "검토 기록 없는 승인", call, ("billing", "approved", "[]", None, "검증", actor), match="approval requires")
    raises(conn, "미해결 조건이 있는 승인", call,
           ("billing", "approved", '[{"item":"약관","resolved":false}]', "REV-1", "검증", actor), match="approval requires")

    before_changes = scalar(conn, "select count(*) from public.gate_changes")
    before_audit = scalar(conn, "select count(*) from public.audit_logs")
    conn.execute(call, ("billing", "conditional", '[{"item":"약관","resolved":false}]', None, "검증", actor))
    check(scalar(conn, "select status::text from public.feature_gates where feature_key = 'billing'") == "conditional",
          "change_feature_gate로 conditional 변경")
    check(scalar(conn, "select count(*) from public.gate_changes") == before_changes + 1, "gate_changes 이력 1건 추가")
    check(scalar(conn, "select count(*) from public.audit_logs") == before_audit + 1, "audit_logs 1건 추가")
    raises(conn, "승인 요청으로 기존 조건 삭제", call, ("billing", "approved", "[]", "REV-1", "검증", actor),
           match="approval requires")
    conn.execute(call, ("billing", "approved", '[{"item":"약관","resolved":true}]', "REV-1", "검증", actor))
    row = conn.execute(
        "select status::text, approved_by::text, approved_at is not null from public.feature_gates where feature_key = 'billing'"
    ).fetchone()
    check(row == ("approved", actor, True), "조건 해결 + 검토 기록이면 승인, approved_by·approved_at 기록")

    for table in ("gate_changes", "audit_logs"):
        raises(conn, f"{table} update", f"update public.{table} set created_at = now()", match="append-only")
        raises(conn, f"{table} delete", f"delete from public.{table}", match="append-only")
        raises(conn, f"{table} truncate", f"truncate public.{table}", match="append-only")


def anon_quota(conn) -> None:
    print("[4] 비로그인 횟수 (DEC-010)")
    fn = CONSUME.split("(")[0]
    call = f"select {fn}(%s, %s, 3, 10, interval '24 hours')"

    s1 = scalar(conn, "insert into public.anon_sessions default values returning id")
    ip = "verify-ip-" + uuid.uuid4().hex
    got = [scalar(conn, call, (s1, ip)) for _ in range(4)]
    check(got == ["ok", "ok", "ok", "session_limit"], f"세션 3회 후 session_limit ({got})")
    check(scalar(conn, "select questions_used from public.anon_sessions where id = %s", (s1,)) == 3, "questions_used = 3")
    check(scalar(conn, "select count(*) from public.anon_usage where anon_session_id = %s", (s1,)) == 3, "anon_usage 3행")
    raises(conn, "questions_used 4 직접 기록", "update public.anon_sessions set questions_used = 4 where id = %s", (s1,),
           match="anon_sessions_questions_used_check")

    # IP 해시 상한: 상한 4로 두고 새 세션에서 1회 더 → 4번째 ok, 5번째 ip_limit
    ip_call = f"select {fn}(%s, %s, 3, 4, interval '24 hours')"
    s2 = scalar(conn, "insert into public.anon_sessions default values returning id")
    got = [scalar(conn, ip_call, (s2, ip)) for _ in range(2)]
    check(got == ["ok", "ip_limit"], f"같은 IP 해시 상한 초과 시 ip_limit ({got})")
    check(scalar(conn, call, (str(uuid.uuid4()), ip)) == "unknown_session", "없는 세션은 unknown_session")
    s3 = scalar(conn, "insert into public.anon_sessions default values returning id")
    check(scalar(conn, call, (s3, None)) == "ok", "IP 해시 없이도 세션 횟수는 센다 (ANON_IP_SALT 없는 개발 환경)")
    raises(conn, "잘못된 상한", f"select {fn}(%s, null, 0, 10, interval '24 hours')", (s3,), match="invalid limits")


def rls(conn) -> None:
    print("[5] RLS")
    alice, bob = make_user(conn), make_user(conn)
    check(scalar(conn, "select role::text from public.profiles where id = %s", (alice,)) == "user",
          "가입 트리거가 profiles(role=user) 생성")

    anon_s = scalar(conn, "insert into public.anon_sessions default values returning id")
    a_inq = scalar(conn, "insert into public.inquiries (user_id, masked_text) values (%s, '[검증] 마스킹본') returning id", (alice,))
    conn.execute("insert into public.inquiries (user_id, masked_text) values (%s, '[검증] 마스킹본')", (bob,))
    conn.execute("insert into public.inquiries (anon_session_id, masked_text) values (%s, '[검증] 마스킹본')", (anon_s,))
    res = scalar(conn, "insert into public.analysis_results (inquiry_id, response, outcome, model, prompt_version) "
                       "values (%s, '{}', 'grounded', 'verify', 'v0') returning id", (a_inq,))
    conn.execute("insert into public.result_citations (result_id, kind, claimed_ref, status, source, source_ref, quote) "
                 "values (%s, 'statute', '민법 제750조', 'verified', 'law_open_api_live', 'law:민법:제750조', '고의 또는 과실로')", (res,))
    conn.execute("insert into public.result_citations (result_id, kind, claimed_ref, status) "
                 "values (%s, 'case', '가짜 사건', 'removed')", (res,))
    conn.execute("insert into public.court_cases (case_no, court, deid_check, source, source_id, content_hash) "
                 "values ('verify-1', '대법원', 'passed', 'verify', 'v1', 'h1'), "
                 "('verify-2', '대법원', 'flagged', 'verify', 'v2', 'h2')")

    with conn.transaction():
        as_user(conn, alice)
        own = [r[0] for r in conn.execute("select user_id::text from public.inquiries")]
        check(own == [alice], "로그인 사용자는 자기 inquiry만 보임 (남의 것·비로그인 것 숨김)")
        cites = [r[0] for r in conn.execute("select status::text from public.result_citations")]
        check(cites == ["verified"], "removed 인용은 사용자에게 안 보임 (F-005)")
        cases = [r[0] for r in conn.execute("select case_no from public.court_cases where case_no like 'verify-%'")]
        check(cases == ["verify-1"], "판례는 deid_check = passed만 보임")
        check(scalar(conn, "select count(*) from public.feature_gates") == 0, "일반 사용자는 게이트 못 봄")
        check(scalar(conn, "select count(*) from public.profiles") == 1, "profiles는 자기 행만")
        raises(conn, "사용자 inquiry 직접 insert",
               "insert into public.inquiries (user_id, masked_text) values (%s, 'x')", (alice,))
        raises(conn, "사용자 role 자가 변경", "update public.profiles set role = 'admin' where id = %s", (alice,))
        conn.execute("reset role")

    with conn.transaction():
        as_user(conn, None)
        for table in ("inquiries", "anon_sessions", "anon_usage", "court_cases", "statutes", "feature_gates"):
            try:
                with conn.transaction():
                    n = scalar(conn, f"select count(*) from public.{table}")
                check(n == 0, f"anon은 {table} 읽기 0행")
            except psycopg.errors.InsufficientPrivilege:
                check(True, f"anon은 {table} 읽기 권한 없음")
        raises(conn, "anon의 anon_usage insert",
               "insert into public.anon_usage (anon_session_id) values (%s)", (anon_s,))
        conn.execute("reset role")

    conn.execute("update public.profiles set role = 'admin' where id = %s", (bob,))
    with conn.transaction():
        as_user(conn, bob)
        check(scalar(conn, "select count(*) from public.feature_gates") == len(GATE_KEYS), "관리자는 게이트 읽기 가능")
        check(scalar(conn, "select count(*) from public.inquiries where user_id = %s", (alice,)) == 0,
              "관리자도 남의 inquiry는 RLS로 못 봄 (서버 경유·감사 기록)")
        conn.execute("reset role")


def citations(conn) -> None:
    print("[6] 인용 저장 제약 (F-005, DEC-007)")
    u = make_user(conn)
    inq = scalar(conn, "insert into public.inquiries (user_id, masked_text) values (%s, '[검증]') returning id", (u,))
    res = scalar(conn, "insert into public.analysis_results (inquiry_id, response, outcome, model, prompt_version) "
                       "values (%s, '{}', 'grounded', 'verify', 'v0') returning id", (inq,))
    ins = ("insert into public.result_citations (result_id, kind, claimed_ref, status, source, source_ref, quote) "
           "values (%s, 'case', '2020다1', %s, %s, %s, %s)")
    raises(conn, "실시간 근거 키 없는 verified", ins, (res, "verified", "law_open_api_live", None, None),
           match="result_citations_verified_has_ref")
    raises(conn, "DB 행 없는 db verified", ins, (res, "verified", "db", None, None),
           match="result_citations_verified_has_ref")
    raises(conn, "60자 넘는 인용 구절", ins, (res, "verified", "law_open_api_live", "case:2020다1", "가" * 61))
    raises(conn, "알 수 없는 source", ins, (res, "unverified", "scrape", None, None))
    conn.execute(ins, (res, "verified", "law_open_api_live", "case:2020다1", "가" * 60))
    check(True, "실시간 근거 키 + 60자 인용은 저장됨")

    parent = scalar(conn, "insert into public.inquiries (user_id, masked_text) values (%s, '[검증]') returning id", (u,))
    child = scalar(conn, "insert into public.inquiries (user_id, masked_text, parent_inquiry_id) "
                         "values (%s, '[검증]', %s) returning id", (u, parent))
    check(child is not None, "이어 묻기 parent_inquiry_id 저장 (F-002 AC3)")
    raises(conn, "자기 자신을 parent로", "update public.inquiries set parent_inquiry_id = id where id = %s", (child,),
           match="inquiries_parent_not_self")
    a1 = scalar(conn, "insert into public.anon_sessions default values returning id")
    conn.execute("insert into public.inquiries (anon_session_id, masked_text, status) values (%s, 'a', 'analyzed'), (%s, 'b', 'analyzed')",
                 (a1, a1))
    check(True, "같은 비로그인 세션의 분석 완료 2건 허용 (1회 유일 인덱스 제거, DEC-010)")


def finish(conn) -> None:
    print("[7] 분석 마무리 finish_demo_analysis (P5, DEC-010)")
    fn = FINISH.split("(")[0]
    call = (
        f"select {fn}(%s, %s, %s, 3, 10, interval '24 hours', %s::jsonb, 'grounded', 'verify', 'v0', "
        "1, 1, 1, %s, 0, %s::jsonb)"
    )
    good = json.dumps([{
        "kind": "statute", "claimed_ref": "민법 제536조", "status": "verified",
        "source": "law_open_api_live", "source_ref": "law:민법:제536조", "quote": "가" * 30,
    }])
    bad = json.dumps([{
        "kind": "statute", "claimed_ref": "민법 제536조", "status": "verified",
        "source": "law_open_api_live", "source_ref": "law:민법:제536조", "quote": "가" * 61,
    }])
    resp = json.dumps({"outcome": "grounded"})

    def used(session):
        return scalar(conn, "select questions_used from public.anon_sessions where id = %s", (session,))

    s1 = scalar(conn, "insert into public.anon_sessions default values returning id")
    i1 = scalar(conn, "insert into public.inquiries (anon_session_id, masked_text) values (%s, '[검증]') returning id", (s1,))
    ip = "verify-ip-" + uuid.uuid4().hex

    raises(conn, "인용 저장 실패(구절 61자)", call, (i1, s1, ip, resp, 1, bad), match="result_citations")
    check(used(s1) == 0, "저장이 실패하면 차감도 되돌아간다")
    check(scalar(conn, "select count(*) from public.analysis_results where inquiry_id = %s", (i1,)) == 0,
          "저장 실패 시 결과 행이 남지 않는다")

    r = scalar(conn, call, (i1, s1, ip, resp, 1, good))
    check(r.get("status") == "ok" and r.get("resultId"), "성공하면 ok와 결과 ID")
    check(used(s1) == 1, "성공 시 1회 차감")
    check(scalar(conn, "select status::text from public.inquiries where id = %s", (i1,)) == "analyzed",
          "질문 상태 analyzed")
    check(scalar(conn, "select count(*) from public.result_citations where result_id = %s", (r["resultId"],)) == 1,
          "인용 행 저장")
    again = scalar(conn, call, (i1, s1, ip, resp, 1, good))
    check(again == {"status": "already_analyzed"}, "같은 질문을 다시 마무리하면 already_analyzed")
    check(used(s1) == 1, "중복 마무리는 차감하지 않는다")
    check(scalar(conn, "select count(*) from public.analysis_results where inquiry_id = %s", (i1,)) == 1,
          "중복 마무리는 결과 행을 만들지 않는다")

    other = scalar(conn, "insert into public.anon_sessions default values returning id")
    i2 = scalar(conn, "insert into public.inquiries (anon_session_id, masked_text) values (%s, '[검증]') returning id", (s1,))
    check(scalar(conn, call, (i2, other, ip, resp, 1, good)) == {"status": "not_owner"},
          "다른 익명 세션은 not_owner (차감 없음)")
    check(used(other) == 0, "not_owner면 차감하지 않는다")

    for _ in range(2):
        i = scalar(conn, "insert into public.inquiries (anon_session_id, masked_text) values (%s, '[검증]') returning id", (s1,))
        scalar(conn, call, (i, s1, ip, resp, 1, good))
    i4 = scalar(conn, "insert into public.inquiries (anon_session_id, masked_text) values (%s, '[검증]') returning id", (s1,))
    check(scalar(conn, call, (i4, s1, ip, resp, 1, good)) == {"status": "session_limit"},
          "세션 3회를 넘으면 session_limit, 결과 저장 안 함")
    check(scalar(conn, "select count(*) from public.analysis_results where inquiry_id = %s", (i4,)) == 0,
          "상한에 걸리면 결과 행 없음")

    u = make_user(conn)
    iu = scalar(conn, "insert into public.inquiries (user_id, masked_text) values (%s, '[검증]') returning id", (u,))
    check(scalar(conn, call, (iu, None, None, resp, 1, good)).get("status") == "ok",
          "로그인 사용자는 차감 없이 저장")


def ops(conn) -> None:
    print("[8] 데모 운영: 레이트 리밋·피드백·내 기록 삭제·보유 기간 (DEC-017, DEC-018 제안)")
    hit = HIT.split("(")[0]
    key = "verify-" + uuid.uuid4().hex
    got = [scalar(conn, f"select {hit}('search', %s, 2, interval '1 hour')", (key,)) for _ in range(3)]
    check(got == [True, True, False], f"레이트 리밋: 상한 2 → 세 번째 막힘 ({got})")
    check(scalar(conn, f"select {hit}('feedback', %s, 2, interval '1 hour')", (key,)) is True,
          "버킷이 다르면 따로 센다 (검색 횟수는 질문 3회와 별개)")
    raises(conn, "잘못된 상한", f"select {hit}('search', %s, 0, interval '1 hour')", (key,), match="invalid rate limit")

    s1 = scalar(conn, "insert into public.anon_sessions default values returning id")
    check(scalar(conn, "select expires_at > now() + interval '29 days' from public.anon_sessions where id = %s", (s1,)),
          "새 익명 세션 보유 기간 30일")
    i1 = scalar(conn, "insert into public.inquiries (anon_session_id, masked_text) values (%s, '[검증]') returning id", (s1,))
    check(scalar(conn, "select expires_at > now() + interval '29 days' from public.inquiries where id = %s", (i1,)),
          "새 질문 보유 기간 30일")
    r1 = scalar(conn, "insert into public.analysis_results (inquiry_id, response, outcome, model, prompt_version) "
                      "values (%s, '{}', 'grounded', 'verify', 'v0') returning id", (i1,))
    conn.execute("insert into public.result_feedback (result_id, helpful) values (%s, true)", (r1,))
    raises(conn, "같은 결과에 피드백 2건", "insert into public.result_feedback (result_id, helpful) values (%s, false)", (r1,),
           match="result_feedback_result_idx")

    fn = CONSUME.split("(")[0]
    scalar(conn, f"select {fn}(%s, null, 3, 10, interval '24 hours')", (s1,))
    audit_before = scalar(conn, "select count(*) from public.audit_logs")
    deleted = scalar(conn, f"select {DELETE_ANON.split('(')[0]}(%s, 'verify-ip')", (s1,))
    check(deleted == 1, f"내 기록 삭제: 질문 1건 삭제 ({deleted})")
    check(scalar(conn, "select count(*) from public.analysis_results where id = %s", (r1,)) == 0,
          "결과·피드백도 함께 삭제")
    check(scalar(conn, "select questions_used from public.anon_sessions where id = %s", (s1,)) == 1,
          "삭제해도 질문 횟수는 되살아나지 않음")
    check(scalar(conn, "select count(*) from public.audit_logs") == audit_before + 1
          and scalar(conn, "select count(*) from public.audit_logs where action = 'anon_data_deleted' and target_id = %s",
                     (s1,)) == 1,
          "삭제 감사 로그 1건 (행위·세션 ID만)")
    check(scalar(conn, f"select {DELETE_ANON.split('(')[0]}(%s, null)", (str(uuid.uuid4()),)) == -1,
          "없는 세션은 -1")

    old = scalar(conn, "insert into public.anon_sessions (expires_at) values (now() - interval '1 day') returning id")
    old_q = scalar(conn, "insert into public.inquiries (anon_session_id, masked_text, expires_at) "
                         "values (%s, '[검증]', now() - interval '1 day') returning id", (old,))
    keep = scalar(conn, "insert into public.anon_sessions (expires_at) values (now() - interval '1 day') returning id")
    keep_q = scalar(conn, "insert into public.inquiries (anon_session_id, masked_text) values (%s, '[검증]') returning id", (keep,))
    check(scalar(conn, "select expires_at > now() from public.anon_sessions where id = %s", (keep,)),
          "새 질문이 생기면 익명 세션 보유 기간이 질문만큼 늘어남")
    out = scalar(conn, f"select {PURGE.split('(')[0]}()")
    check(scalar(conn, "select count(*) from public.inquiries where id = %s", (old_q,)) == 0, "기한 지난 질문 파기")
    check(scalar(conn, "select count(*) from public.anon_sessions where id = %s", (old,)) == 0,
          "질문이 남지 않은 기한 지난 익명 세션 파기")
    check(scalar(conn, "select count(*) from public.inquiries where id = %s", (keep_q,)) == 1, "기한 안 된 질문은 남음")
    check(isinstance(out, dict) and out.get("inquiries", 0) >= 1, f"파기 결과 건수 반환 ({out})")
    check(scalar(conn, "select count(*) from cron.job where jobname = 'hz-retention-purge'") == 1,
          "pg_cron 매일 파기 작업 등록")


def main() -> int:
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        print("SUPABASE_DB_URL이 없습니다 (.env.local)")
        return 2
    try:
        with psycopg.connect(url, connect_timeout=15) as conn:
            print(f"Postgres {scalar(conn, 'show server_version')} — 검사 후 ROLLBACK")
            try:
                with conn.transaction(force_rollback=True):
                    for step in (schema, grants, gates, anon_quota, rls, citations, finish, ops):
                        try:
                            with conn.transaction():
                                step(conn)
                        except psycopg.Error as e:
                            check(False, f"{step.__name__} 중단: {type(e).__name__}: {redact(str(e))[:200]}")
            finally:
                left = scalar(conn, "select count(*) from public.anon_sessions") if conn.closed == 0 else "?"
                print(f"ROLLBACK 완료 (anon_sessions {left}행)")
    except psycopg.Error as e:
        print(f"접속 실패: {type(e).__name__}: {redact(str(e))[:300]}")
        return 2

    failed = [label for ok, label in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} 통과")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
