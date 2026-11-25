"""분석 시간 기록 뽑기 (무료, 읽기만). analysis_results의 모델·프롬프트 버전·토큰·걸린 시간만 읽는다 — 질문·답변 글은 읽지 않는다(결과에서는 단계별 시간 timing만, DEC-063).

사용: uv run --no-project --with "psycopg[binary]" --env-file .env.local python -X utf8 scripts/latency_stats.py <출력.json>
"""

import json
import os
import sys

import psycopg

out = sys.argv[1] if len(sys.argv) > 1 else "latency_rows.json"
with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as conn, conn.cursor() as cur:
    cur.execute(
        """select to_char(created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI'),
                  model, prompt_version, tokens_in, tokens_out, latency_ms,
                  response->'timing'
             from analysis_results
            where latency_ms is not null
            order by created_at"""
    )
    rows = [
        {"at": r[0], "model": r[1], "prompt": r[2], "tokensIn": r[3], "tokensOut": r[4], "latencyMs": r[5], "timing": r[6]}
        for r in cur.fetchall()
    ]
with open(out, "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False)
print("rows", len(rows))
