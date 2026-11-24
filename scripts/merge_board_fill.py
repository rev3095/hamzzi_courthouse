"""예시 답변 빈 칸 채우기 결과(evals/board-gen/out/*--*.json, DEC-062)를 lib/demo/examples.json에 반영한다 (무료, 모델 호출 없음).

사용: python -X utf8 scripts/merge_board_fill.py
- 사건 정리판은 쪽 답변의 deep.plan에 넣는다 (이미 있으면 건드리지 않는다).
- 빈 쟁점 문단은 답변 끝에 출처 model(DEC-055) 문단으로 더하고 그 쟁점에 잇는다.
- 가상 문서는 문서 초안(guide)이 없는 쪽의 result.document에 넣는다.
- 만들 때 이미 서비스와 같은 규칙으로 걸렀다. 검증된 문단·근거·질문은 건드리지 않는다.
"""

import glob
import io
import json

EXAMPLES = "lib/demo/examples.json"


def read(p):
    return io.open(p, encoding="utf-8").read()


data = json.loads(read(EXAMPLES))
by_id = {e["id"]: e for e in data["examples"]}
done = []

for path in sorted(glob.glob("evals/board-gen/out/*--*.json")):
    g = json.loads(read(path))
    ex = by_id.get(g["id"])
    side = next((s for s in (ex or {}).get("sides", []) if s["key"] == g["side"]), None)
    if side is None:
        print("skip", g["id"], g["side"])
        continue
    r = side["result"]
    deep = r.get("deep")
    if not deep:
        continue
    if g.get("plan") and not deep.get("plan"):
        deep["plan"] = g["plan"]
    added = 0
    for a in g.get("issueAnswers", []):
        issue = deep["issues"][a["issue"] - 1]
        if len([i for i in issue["points"]]) >= 2:
            continue
        r["answer"]["points"].append({"text": a["text"], "source": "model", "quote": "", "check": "model"})
        issue["points"].append(len(r["answer"]["points"]) - 1)
        added += 1
    if g.get("document") and not side.get("guide") and not r.get("document"):
        r["document"] = g["document"]
    done.append((g["id"], g["side"], "plan" if deep.get("plan") else "-", added, "doc" if r.get("document") else "-"))

# 예시의 result는 첫 쪽 답변과 같은 값이다(예전 짧은 질문 재생, DEC-059) — 같이 맞춘다
for ex in data["examples"]:
    if ex.get("sides"):
        ex["result"] = json.loads(json.dumps(ex["sides"][0]["result"]))

if done:
    note = " + 2026-11-25 쪽 답변 빈 칸 채우기 (DEC-062, Opus 5.5 effort xhigh 1회: 사건 정리판·빈 쟁점·문서)"
    if "빈 칸 채우기" not in data["source"]:
        data["source"] += note
    io.open(EXAMPLES, "w", encoding="utf-8", newline="\n").write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

print("merged", len(done))
for x in done:
    print("  ", *x)
