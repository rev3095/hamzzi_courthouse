"""저장 전 비식별 재검사 (add-crawler 1-3). 판례는 비실명 처리돼 있지만 잔여 식별정보를 다시 본다.

PII 패턴이 하나라도 있으면 'flagged' → 검색에서 제외된다. 결과에는 패턴 이름만 남기고
일치한 문자열은 반환·기록하지 않는다 (F-007).
"""

import re
from typing import Literal

DeidStatus = Literal["passed", "flagged"]

# 오탐이 잦은 한 글자 성(국·경·도·소 등)은 뺐다. 재현율을 우선하되 일반 단어 오탐은 줄인다.
_SURNAMES = (
    "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채"
)
_ROLES = (
    "원고|피고|피고인|피해자|신청인|피신청인|청구인|피청구인|증인|채권자|채무자|상고인|피상고인"
    "|소외|망|참고인|고소인|고발인|진정인|피의자|사건본인"
)
# 이름 뒤에 붙는 조사. 긴 것부터 확인한다.
_SUFFIXES = (
    "에게서", "에게", "께서", "으로", "에서", "과의", "와의", "은", "는", "이", "가", "의", "에",
    "도", "를", "을", "과", "와", "로",
)  # fmt: skip
# 역할어 뒤에 자주 오는 일반 명사 중 성씨 글자로 시작하는 것 (이름으로 보지 않는다)
_NOT_NAMES = frozenset((
    "주장", "정부", "조합", "이사", "이사회", "이사장", "전부", "전원", "이외", "이상", "이하", "이름", "고객", "한국",
    "주식회사", "유한회사", "남편", "신청", "주소", "주택", "조치", "정도", "서면", "신분", "고소", "고발", "하자", "진술",
    "차량", "차용금", "주의", "지위", "지분", "지급", "성명", "명의", "우선", "손해", "임대인", "임차인", "차주", "전세", "조사",
    "장소", "신고", "임대", "임차", "부동산", "소송", "소장", "정당", "이익", "지정", "지시", "안내", "전체", "서류", "서명",
    "사이", "사망", "사건", "측", "구청", "구청장", "시장", "도지사", "장관", "한도", "한편", "주위", "주택도시보증공사",
    "지방자치단체", "공사", "공단", "회사", "법인", "학교", "병원", "은행", "보험사",
))  # fmt: skip
_NAME_AFTER_ROLE = re.compile(rf"(?:^|[^가-힣])(?:{_ROLES})\s+([가-힣]+)")

PATTERNS: dict[str, re.Pattern[str]] = {
    "resident_no": re.compile(r"(?<!\d)\d{6}\s?-\s?[1-8]\d{6}(?!\d)"),
    "mobile": re.compile(r"(?<!\d)01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)"),
    "phone": re.compile(r"(?<!\d)0(?:2|[3-6]\d)[-.)\s]\d{3,4}[-.\s]\d{4}(?!\d)"),
    "road_address": re.compile(
        r"[가-힣]+(?:시|도)\s+[가-힣]+(?:시|군|구)\s+[가-힣0-9]+(?:로|길)\s*\d+(?:-\d+)?"
    ),
    "lot_address": re.compile(r"[가-힣]+(?:동|리)\s*\d+(?:-\d+)?\s*번지"),
}


def _is_name(candidate: str) -> bool:
    return 2 <= len(candidate) <= 4 and candidate[0] in _SURNAMES and candidate not in _NOT_NAMES


def _looks_like_name(token: str) -> bool:
    """역할어 바로 뒤 한글 낱말이 실명(2~4자, 성씨로 시작)으로 보이는지.

    '김지은은'처럼 이름 끝 글자와 조사가 같은 글자여도 조사 하나만 떼고 본다.
    조사를 뗀 말이 일반 명사 목록에 있으면('정부는', '주장을') 이름으로 보지 않는다.
    """
    stems = [token[: -len(s)] for s in _SUFFIXES if token.endswith(s) and len(token) > len(s)]
    if any(stem in _NOT_NAMES for stem in stems):
        return False
    return any(_is_name(c) for c in (token, *stems))


def find_pii(*texts: str | None) -> list[str]:
    """일치한 패턴 이름 목록 (중복 없음, 정렬)."""
    hits: set[str] = set()
    for text in texts:
        if not text:
            continue
        for name, pattern in PATTERNS.items():
            if pattern.search(text):
                hits.add(name)
        if any(_looks_like_name(m.group(1)) for m in _NAME_AFTER_ROLE.finditer(text)):
            hits.add("named_party")
    return sorted(hits)


def deid_status(*texts: str | None) -> DeidStatus:
    return "flagged" if find_pii(*texts) else "passed"
