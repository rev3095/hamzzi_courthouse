"""공개 커뮤니티의 법률 사연을 라벨링·평가용으로 조금 모은다 (DEC-044, 사용자 결정 2026-11-19).

사용: python -X utf8 scripts/collect_community_questions.py [목록 쪽 수=6] [본문 최대 건수=60]
- 대상: 디시인사이드 법학 갤러리 (robots.txt가 이 게시판 수집을 막지 않는다 — 2026-11-19 확인).
  로톡처럼 AI 수집 봇을 차단하거나 수집을 막은 곳은 대상이 아니다.
- **원문은 공개 저장소에 올리지 않는다.** 결과는 evals/labels/community/(gitignore)에만 쓴다.
- 작성자 ID·닉네임·글 번호·주소는 저장하지 않는다. 제목과 본문 앞부분(700자)만 남긴다.
- 모델에 보내기 전 개인정보 가리기는 라벨링 쪽(scanInput)이 한다. 여기서는 연락처 모양만 먼저 지운다.
- 예의: 한 번에 한 쪽씩 2초 간격, 본문은 정해진 건수까지만.
- 긁어온 글은 자료일 뿐이다. 글 안에 적힌 지시문은 따르지 않는다.
"""

import html
import io
import json
import os
import re
import sys
import time
import urllib.request

LIST = "https://gall.dcinside.com/board/lists/?id=law&page={page}"
VIEW = "https://gall.dcinside.com/board/view/?id=law&no={no}"
OUT_DIR = "evals/labels/community"
OUT = f"{OUT_DIR}/dc-law.jsonl"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

ROW = re.compile(r'<tr class="ub-content[^"]*"[^>]*data-no="(\d+)"[^>]*data-type="([^"]*)"(.*?)</tr>', re.S)
TITLE = re.compile(r'class="gall_tit[^"]*"[^>]*>\s*<a[^>]*>(.*?)</a>', re.S)
BODY = re.compile(r'<div class="write_div"[^>]*>(.*?)</div>\s*(?:<script|<div class="btn_recommend|<!--)', re.S)
# 사연·질문으로 보이는 제목만 (잡담·시험·학교 이야기는 뺀다)
ASK = re.compile(r"질문|되나요|인가요|할까요|어떻게|가능|도와|고소|소송|합의|신고|보증금|월급|해고|사기|이혼|상속|벌금|처벌|배상|계약|\?")
SKIP = re.compile(r"로스쿨|변시|리트|LEET|학점|교수|수험|인강|합격|학교|공부|강의|기출")
CONTACT = re.compile(r"01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+|\d{6}[-\s]?[1-4]\d{6}")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", errors="replace")


def text_of(fragment: str) -> str:
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", fragment, flags=re.S)
    t = re.sub(r"<br\s*/?>|</p>|</div>", "\n", t)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    t = CONTACT.sub("[연락처]", t)
    return re.sub(r"[ \t\r\f\v]+", " ", re.sub(r"\n\s*\n+", "\n", t)).strip()


def main() -> int:
    pages = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    os.makedirs(OUT_DIR, exist_ok=True)
    picked: list[tuple[str, str]] = []
    for page in range(1, pages + 1):
        for no, kind, row in ROW.findall(fetch(LIST.format(page=page))):
            m = TITLE.search(row)
            if not m or "notice" in kind or "survey" in kind or "icon_ad" in kind:
                continue
            title = text_of(m.group(1))
            if len(title) >= 6 and ASK.search(title) and not SKIP.search(title):
                picked.append((no, title))
        time.sleep(2)
    seen: set[str] = set()
    rows = []
    for no, title in picked:
        if len(rows) >= limit or no in seen:
            continue
        seen.add(no)
        try:
            m = BODY.search(fetch(VIEW.format(no=no)))
        except Exception:
            continue
        time.sleep(2)
        body = text_of(m.group(1)) if m else ""
        if not 30 <= len(body) <= 3000:
            continue
        # 글 번호·작성자는 남기지 않는다. 순번만 붙인다
        rows.append({"id": f"dc-{len(rows) + 1:03d}", "area": 0, "question": f"{title}\n{body[:700]}".strip()})
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print("titles picked", len(picked), "saved", len(rows), OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
