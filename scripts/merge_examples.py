"""생성한 예시 답변(evals/examples-gen/out/*.json)을 lib/demo/examples.json과 홈 카테고리에 넣는다 (무료, 모델 호출 없음).

사용: python -X utf8 scripts/merge_examples.py
- 인용 검증을 통과한(verified) 문단만 남긴다. 남은 문단이 2개 미만이면 그 예시는 넣지 않는다 (보고만 한다).
- 근거 목록의 "답변에 씀" 표시는 남은 문단 기준으로 다시 계산한다.
- 이미 examples.json에 있는 id는 건드리지 않는다.
"""

import glob
import io
import json
import re

EXAMPLES = "lib/demo/examples.json"
CATEGORIES = "lib/procedure/categories.ts"
MIN_POINTS = 2


def read(p):
    return io.open(p, encoding="utf-8").read()


def write(p, s):
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)


cat_src = read(CATEGORIES)
labels = dict(re.findall(r'\n  (\w+): \{\n(?:.*\n)*?\s+label: "([^"]+)"', cat_src))

data = json.loads(read(EXAMPLES))
have = {e["id"] for e in data["examples"]} | {x["id"] for x in data.get("excluded", [])}
added, skipped = [], []

for path in sorted(glob.glob("evals/examples-gen/out/*.json")):
    g = json.loads(read(path))
    if g["id"] in have:
        continue
    r = g["result"]
    keep = [i for i, p in enumerate(r["answer"]["points"]) if p["check"] == "verified"]
    points = [r["answer"]["points"][i] for i in keep]
    dropped = len(r["answer"]["points"]) - len(points)
    if r.get("mode") != "ai" or len(points) < MIN_POINTS:
        skipped.append((g["id"], r.get("mode"), len(points)))
        continue
    sources = {p["source"] for p in points}
    result = {
        "outcome": r["outcome"],
        "aiNotice": r["aiNotice"],
        "intent": r["intent"],
        "answer": {"points": points},
        "articles": [{**a, "used": a["id"] in sources} for a in r["articles"]],
        "cases": [{**c, "used": f"case:{c['caseNo']}" in sources} for c in r["cases"]],
        "searches": r["searches"],
        "trace": r.get("trace", []),
        "searchScopeNote": r["searchScopeNote"],
        "recheck": {**r["recheck"], "removed": r["recheck"]["removed"] + dropped},
        "mode": "ai",
    }
    # DeepSearch 예시(DEC-041): 사건 구조의 쟁점은 남은 문단의 새 순번으로 다시 잇는다
    if r.get("deep"):
        new_index = {old: new for new, old in enumerate(keep)}
        result["deep"] = {
            **r["deep"],
            "issues": [
                {"title": i["title"], "points": [new_index[x] for x in i["points"] if x in new_index]}
                for i in r["deep"]["issues"]
            ],
        }
    data["examples"].append(
        {
            "id": g["id"],
            "tags": [labels[g["category"]]],
            "question": g["question"],
            "result": result,
        }
    )
    added.append((g["id"], g["category"], len(points), dropped))

if added:
    note = " + 2026-11-19 홈 카테고리 22개 예시 (Pro Max: Opus 5.5 effort medium 답변 1회, 검증 통과 문단만)"
    if "2026-11-19 홈 카테고리" not in data["source"]:
        data["source"] += note
    write(EXAMPLES, json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    for ex_id, cat, _, _ in added:
        # DeepSearch 예시는 카테고리 목록에 넣지 않는다 (DeepSearch 창에서 따로 연다)
        if ex_id.startswith("deep-"):
            continue
        pat = re.compile(r"(\n  " + cat + r": \{\n(?:.*\n)*?\s+examples: )\[\]")
        cat_src, n = pat.subn(lambda m: f'{m.group(1)}["{ex_id}"]', cat_src, count=1)
        assert n == 1, cat
    write(CATEGORIES, cat_src)

print("added", len(added))
for a in added:
    print("  ", *a)
print("skipped", skipped)
