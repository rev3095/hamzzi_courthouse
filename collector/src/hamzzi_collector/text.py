"""원천 텍스트 정리: HTML 제거, 날짜 파싱, 판례의 참조조문 분리."""

import html
import re
from datetime import date

_BR = re.compile(r"<br\s*/?>", re.IGNORECASE)
_TAG = re.compile(r"<[^>]+>")
_SPACES = re.compile(r"[ \t　]+")
_DATE = re.compile(r"^(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})\.?$")
_ARTICLE = re.compile(r"제\s?(\d+)\s?조(?:\s?의\s?(\d+))?")
_REF_NO = re.compile(r"\[\d+\]")


def clean_html(value: str | None) -> str | None:
    if value is None:
        return None
    text = html.unescape(_TAG.sub("", _BR.sub("\n", value)))
    lines = [_SPACES.sub(" ", line).strip() for line in text.splitlines()]
    text = "\n".join(line for line in lines if line)
    return text or None


def parse_date(value: str | None) -> date | None:
    """'20260508', '2026.05.08', '2026. 5. 8.' 형식을 받는다. 빈 값·잘못된 값은 None."""
    if not value:
        return None
    raw = value.strip()
    if raw.isdigit() and len(raw) == 8:
        y, m, d = raw[:4], raw[4:6], raw[6:]
    else:
        match = _DATE.match(raw)
        if not match:
            return None
        y, m, d = match.groups()
    try:
        return date(int(y), int(m), int(d))
    except ValueError:
        return None


def article_no(number: str | int, branch: str | int | None = None) -> str:
    """조문번호·조문가지번호 → '제3조', '제3조의4'."""
    base = f"제{int(number)}조"
    return f"{base}의{int(branch)}" if branch not in (None, "", "0", 0) else base


def _split_outside_parens(text: str, seps: str) -> list[str]:
    parts, depth, buf = [], 0, []
    for ch in text:
        if ch in "([":
            depth += 1
        elif ch in ")]" and depth:
            depth -= 1
        if ch in seps and depth == 0:
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    parts.append("".join(buf))
    return [p.strip() for p in parts if p.strip()]


def split_statute_refs(value: str | None) -> list[str]:
    """참조조문 원문을 '법령명 제N조…' 단위로 나눈다. 법령명이 생략된 항목은 앞 법령명을 이어 붙인다.

    예: '[1] 민법 제1026조 제1호 / [2] 민법 제105조, 제1022조' →
        ['민법 제1026조 제1호', '민법 제105조', '민법 제1022조']
    """
    text = clean_html(value)
    if not text:
        return []
    text = _REF_NO.sub(" ", text.replace("\n", " "))
    refs: list[str] = []
    for group in _split_outside_parens(text, "/"):
        law = None
        for seg in _split_outside_parens(group, ",·"):
            seg = _SPACES.sub(" ", seg).strip()
            match = _ARTICLE.search(seg)
            if not match:
                continue
            head = seg[: match.start()].strip()
            if head:
                law = head
            elif law:
                seg = f"{law} {seg}"
            else:
                continue
            if seg not in refs:
                refs.append(seg)
    return refs


def parse_ref(raw_ref: str) -> tuple[str, str] | None:
    """'민법 제1026조 제1호' → ('민법', '제1026조'). '구 ○○법(…)'처럼 옛 법령은 매칭하지 않는다."""
    match = _ARTICLE.search(raw_ref)
    if not match:
        return None
    law = raw_ref[: match.start()].strip()
    if not law or law.startswith("구 ") or "(" in law:
        return None
    return law, article_no(match.group(1), match.group(2))
