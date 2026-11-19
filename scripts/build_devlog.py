# 개발 아카이브 만들기. 사용:
#   uv run --no-project --with markdown-it-py --with mdit-py-plugins python -X utf8 scripts/build_devlog.py
# 입력: docs/devlog/data.json (세션·날짜별 기록) + git log(main) + docs/PRD.md 16.2 결정 로그 + 저장소의 md 문서(scripts/devlog_docs.py)
# 출력: docs/devlog.md (GitHub에서 읽는 글 버전) · docs/devlog/index.html (브라우저로 여는 디자인 버전, 데이터·문서 포함 한 파일)
# 기록을 더할 때는 data.json의 entries에 항목을 더하고 다시 실행한다. 공개 저장소이므로 이메일·IP·키·실명은 넣지 않는다.
import base64
import datetime as dt
import json
import pathlib
import posixpath
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "devlog" / "data.json"
OUT_MD = ROOT / "docs" / "devlog.md"
OUT_HTML = ROOT / "docs" / "devlog" / "index.html"
REPO = "https://github.com/rev3095/hamzzi_courthouse"
WEEK = "월화수목금토일"
KIND = {
    "request": "요청",
    "decision": "결정",
    "build": "구현",
    "fix": "수정",
    "report": "보고",
    "problem": "문제",
    "check": "확인",
    "message": "세션 메시지",
}


def git_commits():
    try:
        out = subprocess.run(
            ["git", "log", "--no-merges", "--date=format:%Y-%m-%d %H:%M", "--pretty=%h%x09%ad%x09%s"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=True,
        ).stdout
    except Exception:
        return []
    rows = []
    for line in out.splitlines():
        h, d, s = (line.split("\t", 2) + ["", ""])[:3]
        rows.append({"hash": h, "date": d, "subject": s})
    return rows


def prd_decisions():
    text = (ROOT / "docs" / "PRD.md").read_text(encoding="utf-8")
    rows = []
    for m in re.finditer(r"^\| (DEC-\d{3}) \| (.+?) \|\s*$", text, re.M):
        body = m.group(2)
        b = re.search(r"\*\*(.+?)\*\*", body)
        title = (b.group(1) if b else body)[:120]
        title = re.sub(r"[`*]", "", title).rstrip(":： ")
        rows.append({"id": m.group(1), "title": title})
    return rows


def weekday(d):
    return WEEK[dt.date.fromisoformat(d).weekday()]


def ordered_sessions(sessions):
    """부모 → 자식 순서로 펼친 (세션, 깊이) 목록"""
    by_parent = {}
    for s in sessions:
        by_parent.setdefault(s.get("parent"), []).append(s)
    out = []

    def walk(parent, depth):
        for s in by_parent.get(parent, []):
            out.append((s, depth))
            walk(s["key"], depth + 1)

    walk(None, 0)
    return out


def build_md(data, commits, decs, lib):
    sessions = data["sessions"]
    order = ordered_sessions(sessions)
    depth = {s["key"]: d for s, d in order}
    rank = {s["key"]: i for i, (s, _) in enumerate(order)}
    title = {s["key"]: s["title"] for s in sessions}
    parent = {s["key"]: s.get("parent") for s in sessions}
    entries = data["entries"]
    days = sorted({e["date"] for e in entries})
    L = []
    L.append("# devlog — 햄찌법원 개발 아카이브\n")
    L.append(
        f"{days[0]} ~ {days[-1]} 동안 세션 {len(sessions)}개가 남긴 작업 기록 {len(entries)}건을 날짜 → 세션 계층 순으로 모았다. "
        "결정과 그 이유를 함께 적었고, 사용자 결정은 **[결정]**으로 표시했다.\n"
    )
    L.append(
        "- 디자인 버전(검색·필터·세션 트리·커밋 색인): [`docs/devlog/index.html`](devlog/index.html) — 그림·데이터를 모두 담은 한 파일이라 이 파일만 내려받아 어느 PC에서나 브라우저로 열 수 있다(글꼴은 인터넷 연결 시 Google Fonts).\n"
        "- Claude Code 섹션(VS Code 세션의 답변 전문, 최신순): [`docs/devlog/claude-code.md`](devlog/claude-code.md) — `scripts/build_devlog_claude_code.py`로 만든다.\n"
        "- 원본: 각 세션의 대화 기록을 읽고 요약했다. 측정하지 않은 값은 \"추정\", 확인하지 못한 것은 그렇다고 적었다.\n"
        "- 문서 아카이브: 저장소의 보고서·PRD·조사·모듈 README 등 md 문서 전체를 디자인 버전의 \"문서\" 탭에 넣었다(목록은 이 파일 맨 끝).\n"
        "- 다시 만들기: `docs/devlog/data.json`에 기록을 더하고 `uv run --no-project --with markdown-it-py --with mdit-py-plugins python -X utf8 scripts/build_devlog.py`.\n"
    )
    L.append("## 세션 계층\n")
    for s, d in order:
        n = sum(1 for e in entries if e["session"] == s["key"])
        pr = f" · PR {', '.join(map(str, s['prs']))}" if s.get("prs") else ""
        L.append(f"{'  ' * d}- **{s['title']}** — {s.get('tool', '')} · {s.get('period', '')} · 기록 {n}건{pr}  ")
        if s.get("purpose"):
            L.append(f"{'  ' * d}  {s['purpose']}")
    L.append("\n---\n")
    L.append("## 날짜별 기록\n")
    for day in reversed(days):
        L.append(f"### {day} ({weekday(day)})\n")
        todays = [e for e in entries if e["date"] == day]
        keys = sorted({e["session"] for e in todays}, key=lambda k: rank.get(k, 99))
        printed = set()
        for k in keys:
            chain = []
            p = k
            while p is not None:
                chain.append(p)
                p = parent.get(p)
            for a in reversed(chain):
                if a in printed:
                    continue
                printed.add(a)
                h = "#" * min(4 + depth.get(a, 0), 6)
                arrow = "↳ " * depth.get(a, 0)
                L.append(f"{h} {arrow}{title.get(a, a)}\n")
                for e in sorted([x for x in todays if x["session"] == a], key=lambda x: x.get("time") or ""):
                    tag = KIND.get(e.get("kind"), e.get("kind", ""))
                    t = f"`{e['time']}` " if e.get("time") else ""
                    head = f"**[{tag}] {e['title']}**"
                    refs = [f"[`{c}`]({REPO}/commit/{c})" for c in e.get("commits", [])]
                    refs += e.get("ids", [])
                    tail = f" ({', '.join(refs)})" if refs else ""
                    L.append(f"- {t}{head} — {e.get('detail', '')}{tail}")
                L.append("")
    L.append("---\n")
    L.append("## 사용자 결정 모음\n")
    L.append("| 날짜 | 세션 | 결정 | 번호 |\n|---|---|---|---|")
    for d in sorted(data.get("decisions", []), key=lambda x: x["date"]):
        L.append(f"| {d['date']} | {title.get(d['session'], d['session'])} | {d['text']} | {d.get('id', '')} |")
    L.append("\n## 결정 로그 (PRD 16.2)\n")
    L.append("| 번호 | 제목 |\n|---|---|")
    for d in decs:
        L.append(f"| {d['id']} | {d['title']} |")
    L.append("\n## 끝까지 확인하지 못한 것\n")
    for s, dpt in order:
        items = data.get("unresolved", {}).get(s["key"], [])
        if items:
            L.append(f"**{s['title']}**\n")
            L += [f"- {x}" for x in items]
            L.append("")
    L.append("## 커밋 색인\n")
    L.append(f"<details><summary>main 커밋 {len(commits)}개 (병합 제외)</summary>\n")
    L.append("| 커밋 | 시각 | 제목 |\n|---|---|---|")
    for c in commits:
        L.append(f"| [`{c['hash']}`]({REPO}/commit/{c['hash']}) | {c['date']} | {c['subject'].replace('|', '/')} |")
    L.append("\n</details>\n")
    build_docs_md(L, lib)
    OUT_MD.write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")


def build_docs_md(L, lib):
    """글 버전 끝에 문서 아카이브 목록을 붙인다"""
    L.append("## 문서 아카이브\n")
    L.append(f"저장소의 md 문서 {len(lib['docs'])}개. 디자인 버전의 \"문서\" 탭에서 읽기 좋게 볼 수 있다.\n")
    for g in lib["groups"]:
        ds = [d for d in lib["docs"] if d["group"] == g["name"]]
        if not ds:
            continue
        L.append(f"### {g['name']} ({len(ds)})\n")
        for d in ds:
            rel = posixpath.relpath(d["path"], "docs")
            L.append(f"- [{d['title']}]({rel}) — `{d['path']}` · 수정 {d['updated']}")
        L.append("")


def build_html(data, commits, decs, lib):
    payload = {
        "docs": lib["docs"],
        "docGroups": lib["groups"],
        "sessions": [dict(s, depth=d) for s, d in ordered_sessions(data["sessions"])],
        "entries": data["entries"],
        "decisions": data.get("decisions", []),
        "unresolved": data.get("unresolved", {}),
        "commits": commits,
        "prd": decs,
        "repo": REPO,
        "built": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    js = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    tpl = (ROOT / "scripts" / "devlog_template.html").read_text(encoding="utf-8")
    OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    # 햄찌 판사 그림을 data URI로 넣어 이 파일 하나만 다른 PC로 옮기거나 게시해도 그대로 보이게 한다
    mascot = ROOT / "public" / "mascot" / "hamzzi-judge.webp"
    src = "data:image/webp;base64," + base64.b64encode(mascot.read_bytes()).decode() if mascot.exists() else ""
    tpl = tpl.replace("__MASCOT__", src)
    OUT_HTML.write_text(tpl.replace("/*__DATA__*/null", js), encoding="utf-8", newline="\n")


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    commits = git_commits()
    decs = prd_decisions()
    try:
        from devlog_docs import collect
    except ImportError:
        raise SystemExit(
            "markdown-it-py가 필요합니다: uv run --no-project --with markdown-it-py --with mdit-py-plugins python -X utf8 scripts/build_devlog.py"
        )
    lib = collect(ROOT, REPO)
    build_md(data, commits, decs, lib)
    build_html(data, commits, decs, lib)
    print(
        f"devlog: 세션 {len(data['sessions'])} · 기록 {len(data['entries'])} · 커밋 {len(commits)} · 결정 {len(decs)} · 문서 {len(lib['docs'])}"
    )


if __name__ == "__main__":
    main()
