# 개발 아카이브의 "문서" 탭 자료 만들기 — build_devlog.py가 부른다.
# 저장소에 올라간(git ls-files) md 문서를 모아 HTML로 바꾼다. 원문은 이미 공개 저장소에 있는 것만 쓴다.
# markdown-it-py가 필요하다: uv run --no-project --with markdown-it-py --with mdit-py-plugins python -X utf8 scripts/build_devlog.py
import html
import posixpath
import re
import subprocess
from urllib.parse import unquote

from markdown_it import MarkdownIt
from mdit_py_plugins.anchors import anchors_plugin
from mdit_py_plugins.footnote import footnote_plugin
from mdit_py_plugins.tasklists import tasklists_plugin

# 아카이브 자체의 글 버전은 타임라인 탭과 같은 내용이라 뺀다.
SKIP = {"docs/devlog.md"}

# (묶음 이름, 설명, 경로 판정) — 위에서부터 먼저 맞는 묶음에 넣는다.
GROUPS = [
    ("보고서", "날짜별 분석·결정 보고서 (모델·비용 비교, 배포·운영 절차)", lambda p: p.startswith("docs/reports/")),
    ("제품 기획·설계", "PRD, 구조, 데이터 모델, API, 브랜드·Figma·Play 배포", lambda p: p.startswith("docs/") and p.count("/") == 1),
    ("조사", "데이터 소스, 경쟁사, 규제 쟁점, 화면 도구, 공식 서식, 분류 근거", lambda p: p.startswith("docs/research/")),
    ("Claude Code 답변 기록", "VS Code 세션 답변 전문 (최신순)", lambda p: p.startswith("docs/devlog/")),
    ("모듈 설명", "lib 모듈·수집기·평가셋·앱 README", lambda p: p.endswith("README.md") or p.endswith("CHANGELOG.md")),
    ("Claude Code 지침", "CLAUDE.md, AGENTS.md, 스킬, 리뷰어 에이전트", lambda p: p in ("CLAUDE.md", "AGENTS.md") or p.startswith(".claude/")),
]


def _slug(s):
    s = re.sub(r"<[^>]+>", "", s).strip().lower()
    s = re.sub(r"[^\w\- ]", "", s)
    return "h-" + s.replace(" ", "-")


def _md():
    md = MarkdownIt("commonmark", {"html": True, "linkify": False, "typographer": False})
    md.enable(["table", "strikethrough"])
    md.use(anchors_plugin, min_level=1, max_level=4, slug_func=_slug)
    md.use(footnote_plugin)
    md.use(tasklists_plugin)
    return md


def _git(root, *args):
    return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, encoding="utf-8", check=True).stdout


def _sanitize(h):
    h = re.sub(r"<script\b.*?</script>", "", h, flags=re.S | re.I)
    h = re.sub(r"\son\w+\s*=\s*(\"[^\"]*\"|'[^']*')", "", h, flags=re.I)
    return h


def _rewrite_links(h, path, tracked, docset, repo):
    base = posixpath.dirname(path)

    def fix(m):
        url = html.unescape(m.group(1))
        if re.match(r"^[a-z][a-z0-9+.-]*:", url, re.I):
            return f'href="{html.escape(url)}" target="_blank" rel="noopener"'
        target, _, frag = url.partition("#")
        if not target:  # 같은 문서 안 이동
            return f'href="#doc/{html.escape(path)}#{html.escape(frag)}"'
        target = unquote(target)  # markdown-it이 한글 주소를 %인코딩한다
        cands = [posixpath.normpath(posixpath.join(base, target)), posixpath.normpath(target.lstrip("/"))]
        if any(c in ("docs/devlog.md", "docs/devlog/index.html") for c in cands):  # 아카이브 자신 → 타임라인 탭
            return 'href="#timeline"'
        for c in cands:
            if c in docset:
                return f'href="#doc/{html.escape(c)}{"#" + html.escape(frag) if frag else ""}"'
        for c in cands:
            if c in tracked or any(t.startswith(c.rstrip("/") + "/") for t in tracked):
                return f'href="{repo}/blob/main/{html.escape(c)}" target="_blank" rel="noopener"'
        return f'href="{repo}/blob/main/{html.escape(cands[0])}" target="_blank" rel="noopener"'

    return re.sub(r'href="([^"]*)"', fix, h)


def collect(root, repo):
    tracked = set(_git(root, "ls-files").splitlines())
    paths = sorted(p for p in tracked if p.lower().endswith(".md") and p not in SKIP and "node_modules/" not in p)
    docset = set(paths)
    md = _md()
    docs = []
    for p in paths:
        src = (root / p).read_text(encoding="utf-8")
        body = re.sub(r"^---\n.*?\n---\n", "", src, count=1, flags=re.S)  # 스킬 머리말(frontmatter)
        m = re.search(r"^#\s+(.+)$", body, re.M)
        title = re.sub(r"[`*]", "", m.group(1)).strip() if m else posixpath.basename(p)
        if m and not body[: m.start()].strip():  # 맨 앞 제목은 화면 머리에 따로 보이므로 본문에서 뺀다
            body = body[m.end() :]
        group = next((g for g, _, f in GROUPS if f(p)), "기타")
        log = _git(root, "log", "-1", "--date=format:%Y-%m-%d", "--format=%ad", "--", p).strip()
        first = _git(root, "log", "--diff-filter=A", "--date=format:%Y-%m-%d", "--format=%ad", "--", p).strip().splitlines()
        h = _rewrite_links(_sanitize(md.render(body)), p, tracked, docset, repo)
        # mermaid 원문은 그대로 보여 주되 표시를 단다
        h = h.replace('<pre><code class="language-mermaid">', '<pre class="mermaid-src"><code class="language-mermaid">')
        docs.append(
            {
                "path": p,
                "group": group,
                "title": title,
                "updated": log,
                "created": first[-1] if first else log,
                "chars": len(src),
                "html": h,
            }
        )
    order = {g: i for i, (g, _, _) in enumerate(GROUPS)}
    # 보고서는 최신이 위, 나머지는 경로 순
    reports = sorted([d for d in docs if d["group"] == "보고서"], key=lambda d: d["path"], reverse=True)
    docs = reports + [d for d in docs if d["group"] != "보고서"]
    docs.sort(key=lambda d: order.get(d["group"], 99))  # 안정 정렬: 묶음 순서만 맞춘다
    groups = [{"name": g, "desc": desc} for g, desc, _ in GROUPS] + [{"name": "기타", "desc": ""}]
    return {"docs": docs, "groups": groups}
