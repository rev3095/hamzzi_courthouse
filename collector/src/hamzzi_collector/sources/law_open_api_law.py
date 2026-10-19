"""법제처 국가법령정보 공동활용 Open API — 현행법령(시행일 기준, target=eflaw).

목록: lawSearch.do?target=eflaw&nw=3(현행), 본문: lawService.do?target=eflaw&MST=<법령일련번호>&efYd=<시행일자>
가이드: https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=lsEfYdListGuide
         https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=lsNwInfoGuide
조문 단위로 statutes에 버전별 1행으로 저장한다 (DATA_MODEL 2절, F-004).
"""

from collections.abc import Iterator
from datetime import date

from hamzzi_collector.law_api import LawApiClient
from hamzzi_collector.models import LawVersion, Statute
from hamzzi_collector.text import article_no, clean_html, parse_date

RUN_SOURCE = "law_open_api_law"
TARGET = "eflaw"
CURRENT = "3"


def public_url(mst: str, effective_from: date) -> str:
    # 응답의 '법령상세링크'에는 인증키가 들어 있어 쓰지 않는다.
    return f"https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq={mst}&efYd={effective_from:%Y%m%d}"


def _as_list(value: object) -> list:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def list_laws(
    client: LawApiClient,
    *,
    query: str | None = None,
    effective_since: date | None = None,
    until: date | None = None,
    page_size: int = 100,
    max_items: int | None = None,
) -> Iterator[dict]:
    """현행 법령 목록. query(법령명) 또는 시행일 범위로 좁힌다."""
    params: dict = {"nw": CURRENT, "display": page_size}
    if query:
        params["query"] = query
    if effective_since:
        params["efYd"] = f"{effective_since:%Y%m%d}~{(until or date.today()):%Y%m%d}"
    page, seen = 1, 0
    while True:
        data = client.search(TARGET, page=page, **params).get("LawSearch") or {}
        items = [i for i in _as_list(data.get("law")) if isinstance(i, dict)]
        for item in items:
            yield item
            seen += 1
            if max_items is not None and seen >= max_items:
                return
        total = int(data.get("totalCnt") or 0)
        if not items or page * page_size >= total:
            return
        page += 1


def fetch_law(client: LawApiClient, mst: str, effective_yd: str) -> dict:
    return client.service(TARGET, MST=mst, efYd=effective_yd)


def _texts(value: object) -> list[str]:
    """조문내용 등은 문자열이거나 (중첩) 리스트로 온다."""
    if value is None:
        return []
    if isinstance(value, str):
        cleaned = clean_html(value)
        return [cleaned] if cleaned else []
    if isinstance(value, list):
        return [t for v in value for t in _texts(v)]
    return []


def _article_body(unit: dict) -> str:
    lines = _texts(unit.get("조문내용"))
    for para in _as_list(unit.get("항")):
        if not isinstance(para, dict):
            continue
        lines += _texts(para.get("항내용"))
        for item in _as_list(para.get("호")):
            if not isinstance(item, dict):
                continue
            lines += _texts(item.get("호내용"))
            for sub in _as_list(item.get("목")):
                if isinstance(sub, dict):
                    lines += _texts(sub.get("목내용"))
    return "\n".join(lines)


def parse_law(body: dict, mst: str) -> LawVersion:
    """lawService 법령 본문 응답 → LawVersion. 장·절 제목(조문여부='전문')은 건너뛴다."""
    law = body.get("법령")
    if not isinstance(law, dict):
        raise TypeError("법령 없음")
    info = law.get("기본정보") or {}
    law_id = (info.get("법령ID") or "").strip()
    law_name = (info.get("법령명_한글") or "").strip()
    effective = parse_date(info.get("시행일자"))
    if not (law_id and law_name and effective):
        raise ValueError("기본정보 필수 필드 누락")
    url = public_url(mst, effective)
    articles: list[Statute] = []
    for unit in _as_list((law.get("조문") or {}).get("조문단위")):
        if not isinstance(unit, dict) or unit.get("조문여부") != "조문":
            continue
        articles.append(
            Statute(
                law_id=law_id,
                law_name=law_name,
                article_no=article_no(unit.get("조문번호") or "", unit.get("조문가지번호")),
                article_title=(unit.get("조문제목") or "").strip() or None,
                body=_article_body(unit),
                effective_from=parse_date(unit.get("조문시행일자")) or effective,
                source_url=url,
                version=mst,
            )
        )
    return LawVersion(
        law_id=law_id, law_name=law_name, version=mst, effective_from=effective, articles=articles
    )
