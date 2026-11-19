"""라벨 평가셋 채점 (무료). 사용: python -X utf8 scripts/score_label_eval.py <실행 결과.jsonl> [정답 파일=evals/labels/eval-set.jsonl]
정답은 evals/labels/eval-set.jsonl — gold[0]이 기준 정답, gold의 나머지는 받아들이는 다른 답.
"""
import io
import json
import sys

gold = {r["id"]: r for r in (json.loads(l) for l in io.open(sys.argv[2] if len(sys.argv) > 2 else "evals/labels/eval-set.jsonl", encoding="utf-8") if l.startswith('{"id"'))}
run = [json.loads(l) for l in io.open(sys.argv[1], encoding="utf-8") if l.strip()]
strict = lenient = 0
by_kind: dict[str, list[int]] = {}
others_hit = others_total = spurious = 0
wrong = []
for r in run:
    g = gold[r["id"]]
    got = r["section"] or "none"
    ok_strict = got == g["gold"][0]
    ok = got in g["gold"]
    strict += ok_strict
    lenient += ok
    k = by_kind.setdefault(g["kind"], [0, 0])
    k[0] += ok
    k[1] += 1
    allowed = set(g["goldOthers"]) | set(g["gold"])
    for o in r["others"]:
        if o in allowed:
            others_hit += 1
        else:
            spurious += 1
    others_total += len(r["others"])
    if not ok:
        wrong.append(f'{r["id"]} got={got} others={r["others"]} want={g["gold"]} | {g["question"][:46]}')
n = len(run)
print(f"n={n} 기준 정답 일치 {strict} ({strict / n:.0%}) · 받아들이는 답 포함 {lenient} ({lenient / n:.0%})")
print("종류별:", {k: f"{v[0]}/{v[1]}" for k, v in by_kind.items()})
print(f"함께 걸린 절차: 낸 것 {others_total}개 중 맞는 것 {others_hit} · 근거 없는 것 {spurious}")
print("새 라벨 제안:", [(r["id"], r["rawNewLabel"]) for r in run if r["rawNewLabel"]])
print("틀린 것:")
for w in sorted(wrong):
    print("  ", w)
