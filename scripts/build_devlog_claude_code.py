"""devlog의 Claude Code 섹션 만들기 — 이 세션이 한 답변 전문을 최신순으로 모은다.

사용: python -X utf8 scripts/build_devlog_claude_code.py <대화 기록.jsonl> [<대화 기록.jsonl> ...]
출력: docs/devlog/claude-code.md

- 사용자 요청은 앞부분만 줄여 싣고(요약), Claude Code의 답변은 그 차례의 마지막 답변 전문을 싣는다.
  도구 호출·중간 진행 한 줄·시스템 알림은 싣지 않는다.
- 저장소가 공개라 사용자 폴더 이름·키 모양 문자열은 가린다. 대화 기록 파일 자체는 저장소에 올리지 않는다.
"""

import io
import json
import re
import sys
from datetime import datetime, timedelta, timezone

OUT = "docs/devlog/claude-code.md"
MIDTURN = re.compile(r"The user sent a new message while you were working:\s*(.*?)\s*This is how Claude Code surfaces", re.S)
KST = timezone(timedelta(hours=9))
REQUEST_CHARS = 900
# 중간 진행 한 줄이 아니라 "답변"으로 볼 최소 길이
MIN_ANSWER_CHARS = 200

REDACT = [
    (re.compile(r"[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s\"'`)]+"), r"C:\\Users\\<사용자>"),
    (re.compile(r"sk-ant-[A-Za-z0-9_\-]{8,}"), "<키>"),
    (re.compile(r"eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"), "<토큰>"),
    (re.compile(r"[\w.+-]+@(?!anthropic\.com)[\w-]+\.[\w.]+"), "<이메일>"),
    (re.compile(r"(ADMIN_PASSCODE|GEN_ADMIN_PASSCODE)=\S+"), r"\1=<가림>"),
]


def redact(s: str) -> str:
    for pat, rep in REDACT:
        s = pat.sub(rep, s)
    return s


def texts(content) -> list[str]:
    if isinstance(content, str):
        return [content]
    out = []
    for b in content or []:
        if isinstance(b, dict) and b.get("type") == "text":
            out.append(b.get("text", ""))
    return out


def strings(node) -> list[str]:
    """내용 안의 모든 글 조각 (도구 결과 속 글 포함)."""
    if isinstance(node, str):
        return [node]
    if isinstance(node, list):
        return [s for x in node for s in strings(x)]
    if isinstance(node, dict):
        return [s for k in ("text", "content") for s in strings(node.get(k))]
    return []


def is_real_user(msg: dict, parts: list[str]) -> bool:
    c = msg.get("content")
    if isinstance(c, list) and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c):
        return False
    return any(p.strip() for p in parts)


def clean_user(parts: list[str]) -> str:
    t = "\n".join(parts)
    t = re.sub(r"<system-reminder>.*?</system-reminder>", "", t, flags=re.S)
    t = re.sub(r"<ide_[a-z_]+>.*?</ide_[a-z_]+>", "", t, flags=re.S)
    t = re.sub(r"</?pasted_content[^>]*>", "", t)
    t = re.sub(r"\[SYSTEM NOTIFICATION.*", "", t, flags=re.S)
    t = re.sub(r"<task-notification>.*?</task-notification>", "", t, flags=re.S)
    return t.strip()


def main() -> int:
    turns: list[dict] = []
    for path in sys.argv[1:]:
        cur = None
        for line in io.open(path, encoding="utf-8", errors="replace"):
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if row.get("isSidechain") or row.get("type") not in ("user", "assistant"):
                continue
            msg = row.get("message") or {}
            parts = texts(msg.get("content"))
            if row["type"] == "user":
                if not is_real_user(msg, parts):
                    # 작업 중에 사용자가 보낸 추가 요청은 도구 결과에 섞여 온다 — 그 차례의 요청에 덧붙인다
                    if cur is not None:
                        for extra in MIDTURN.findall("\n".join(strings(msg.get("content")))):
                            text = clean_user([extra])
                            if text:
                                cur["request"] += "\n(작업 중 추가 요청) " + text
                    continue
                req = clean_user(parts)
                # 요약으로 이어 붙인 문맥(자동 압축)과 빈 알림은 요청이 아니다
                if not req or req.startswith("This session is being continued") or req.startswith("Base directory for this skill"):
                    continue
                cur = {"at": row.get("timestamp"), "request": req, "answers": []}
                turns.append(cur)
            elif cur is not None:
                for p in parts:
                    if p.strip():
                        cur["answers"].append(p.strip())

    entries = []
    carried: list[str] = []
    for t in turns:
        long = [a for a in t["answers"] if len(a) >= MIN_ANSWER_CHARS]
        if not long:
            # 긴 답변 없이 끝난 요청(중단·이어서 진행)은 다음 답변의 요청에 합친다 — 요청이 사라지지 않게
            carried.append(t["request"])
            continue
        if carried:
            t = {**t, "request": "".join("(앞선 요청) " + c + "\n" for c in carried) + t["request"]}
            carried = []
        # 그 차례의 마지막 긴 답변이 최종 보고다. 그 앞의 긴 글(계획·중간 보고)도 답변이라 함께 남긴다
        entries.append({**t, "final": long[-1], "earlier": long[:-1]})
    entries.sort(key=lambda e: e["at"] or "", reverse=True)

    def when(ts):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(KST).strftime("%Y-%m-%d %H:%M")
        except Exception:
            return "시각 미상"

    L = [
        "# devlog — Claude Code 섹션 (답변 전문, 최신순)\n",
        "VS Code의 Claude Code 세션이 사용자 요청마다 한 답변을 **요약하지 않고 그대로** 모았다. 위가 최신이다.\n",
        f"- 답변 {len(entries)}건 (요청 {len(turns)}건 가운데 긴 답변이 있는 것). 사용자 요청은 앞 {REQUEST_CHARS}자만 실었다.",
        "- 도구 호출·중간 진행 한 줄·시스템 알림은 뺐다. 한 요청에 계획이나 중간 보고가 따로 있었으면 \"그 전에 한 답변\"으로 접어 두었다.",
        "- 저장소가 공개라 사용자 폴더 이름·키 모양 문자열·이메일은 가렸다. 답변 속 금액·수치는 그 시점의 값이다.",
        "- 다시 만들기: `python -X utf8 scripts/build_devlog_claude_code.py <대화 기록.jsonl>` (대화 기록 파일은 저장소에 없다).",
        "- 요약판·세션 계층·결정 색인은 [`../devlog.md`](../devlog.md)에 있다.\n",
        "## 차례\n",
    ]
    for i, e in enumerate(entries, 1):
        first = e["request"].replace("\n", " ")
        L.append(f"{i}. [{when(e['at'])}](#a{i}) — {redact(first[:70])}{'…' if len(first) > 70 else ''}")
    L.append("")
    for i, e in enumerate(entries, 1):
        req = e["request"]
        L.append(f'\n---\n\n<a id="a{i}"></a>\n\n## {i}. {when(e["at"])}\n')
        L.append("**요청 (앞부분)**\n")
        shown = redact(req[:REQUEST_CHARS]) + ("…" if len(req) > REQUEST_CHARS else "")
        L.append("\n".join("> " + ln for ln in shown.split("\n")))
        L.append("\n**Claude Code 답변**\n")
        L.append(redact(e["final"]))
        if e["earlier"]:
            L.append(f"\n<details><summary>그 전에 한 답변 {len(e['earlier'])}건 (계획·중간 보고)</summary>\n")
            for a in e["earlier"]:
                L.append(redact(a))
                L.append("\n· · ·\n")
            L.append("</details>")
    io.open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    print("turns", len(turns), "entries", len(entries), "chars", sum(len(x) for x in L))
    return 0


if __name__ == "__main__":
    sys.exit(main())
