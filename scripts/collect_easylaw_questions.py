"""법제처 찾기쉬운 생활법령정보 "100문 100답"의 질문 문장을 모은다 (DEC-042, 라벨링용).

사용: python -X utf8 scripts/collect_easylaw_questions.py [쪽 수=10]
- 가져오는 것: 질문 문장과 분야 번호뿐이다. 답변 본문은 저장하지 않는다.
- 출처: 법제처 찾기쉬운 생활법령정보 (https://www.easylaw.go.kr). 저작권정책이 출처 표기를 조건으로 이용을 허용하고,
  robots.txt가 목록 수집을 막지 않는다 (2026-11-19 확인). 정부가 쓴 질문이라 개인정보가 없다.
- 예의: 목록 쪽만, 한 번에 한 쪽씩 2초 간격으로 가져온다.
- 로톡 등 민간 상담 글은 수집하지 않는다 (실제 사람의 민감한 사연·저작권·약관).
"""

import html
import io
import json
import re
import sys
import time
import urllib.request

BASE = "https://www.easylaw.go.kr/CSP/OnhunqueansLstRetrieve.laf"
OUT = "evals/labels/easylaw-questions.jsonl"
PER_PAGE = 50
ITEM = re.compile(
    r'OnhunqueansInfoRetrieve\.laf\?onhunqnaAstSeq=(\d+)&onhunqueSeq=(\d+)[^>]*>\s*([^<]{5,400}?)\s*</a>',
    re.S,
)


def fetch(page: int) -> str:
    url = f"{BASE}?curPage={page}&pageType={PER_PAGE}"
    req = urllib.request.Request(url, headers={"User-Agent": "hamzzi-courthouse-research/1.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", errors="replace")


def main() -> int:
    pages = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    seen: dict[str, dict] = {}
    for page in range(1, pages + 1):
        found = ITEM.findall(fetch(page))
        new = 0
        for area, seq, text in found:
            q = re.sub(r"\s+", " ", html.unescape(text)).strip()
            if seq in seen or len(q) < 8:
                continue
            seen[seq] = {"id": f"easylaw-{seq}", "area": int(area), "question": q}
            new += 1
        print(f"page {page}: {len(found)} items, {new} new")
        if new == 0:
            break
        time.sleep(2)
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(
            json.dumps(
                {
                    "_source": "법제처 찾기쉬운 생활법령정보 100문 100답 (https://www.easylaw.go.kr) — 질문 문장만",
                    "_collected": time.strftime("%Y-%m-%d"),
                },
                ensure_ascii=False,
            )
            + "\n"
        )
        for row in seen.values():
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print("saved", len(seen), OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
