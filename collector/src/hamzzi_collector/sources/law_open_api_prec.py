"""법제처 국가법령정보 공동활용 Open API — 판례 (target=prec).

목록: lawSearch.do?target=prec, 본문: lawService.do?target=prec&ID=<판례일련번호>
가이드: https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=precListGuide
         https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=precInfoGuide
판례 전문(판례내용)은 OQ-DM-05 확정 전까지 저장하지 않는다 (Settings.store_full_text).
"""

from collections.abc import Iterator
from datetime import date

from hamzzi_collector.deid import deid_status
from hamzzi_collector.law_api import LawApiClient
from hamzzi_collector.models import CourtCase, ParsedCase
from hamzzi_collector.text import clean_html, parse_date, split_statute_refs

SOURCE = "law_open_api"
RUN_SOURCE = "law_open_api_prec"
TARGET = "prec"
# 본문을 HTML로만 제공하는 출처 (가이드: "국세청 판례 본문 조회는 HTML만 가능"). JSON 수집 대상에서 뺀다.
HTML_ONLY_SOURCES = frozenset({"국세법령정보시스템"})


def public_url(source_id: str) -> str:
    # 응답의 '판례상세링크'에는 인증키가 들어 있어 쓰지 않는다.
    return f"https://www.law.go.kr/LSW/precInfoP.do?precSeq={source_id}"


def _as_list(value: object) -> list[dict]:
    if value is None:
        return []
    if isinstance(value, dict):
        return [value]
    return [v for v in value if isinstance(v, dict)] if isinstance(value, list) else []


def list_cases(
    client: LawApiClient,
    since: date,
    until: date,
    *,
    query: str | None = None,
    page_size: int = 100,
    max_items: int | None = None,
) -> Iterator[dict]:
    """선고일 범위 [since, until]의 판례 목록 항목을 최신순으로 낸다. HTML 전용 출처는 건너뛴다."""
    params: dict = {
        "prncYd": f"{since:%Y%m%d}~{until:%Y%m%d}",
        "sort": "ddes",
        "display": page_size,
    }
    if query:
        params["query"] = query
    page, seen = 1, 0
    while True:
        data = client.search(TARGET, page=page, **params).get("PrecSearch") or {}
        items = _as_list(data.get("prec"))
        for item in items:
            if item.get("데이터출처명") in HTML_ONLY_SOURCES:
                continue
            yield item
            seen += 1
            if max_items is not None and seen >= max_items:
                return
        total = int(data.get("totalCnt") or 0)
        if not items or page * page_size >= total:
            return
        page += 1


def fetch_case(client: LawApiClient, source_id: str) -> dict:
    return client.service(TARGET, ID=source_id)


def _court(raw: dict) -> str:
    court = (raw.get("법원명") or "").strip()
    if court:
        return court
    # 일부 출처(예: 국세법령정보시스템)는 법원명이 비어 있고 사건번호가 '인천지방법원-2025-가단-…' 형식이다.
    prefix = (raw.get("사건번호") or "").split("-", 1)[0].strip()
    return prefix if prefix.endswith("법원") else ""


def parse_case(body: dict, *, store_full_text: bool = False) -> ParsedCase:
    """lawService 판례 본문 응답 → ParsedCase. 필수 필드가 없으면 ValueError(ValidationError)."""
    raw = body.get("PrecService")
    if not isinstance(raw, dict):
        raise TypeError("PrecService 없음")
    source_id = str(raw.get("판례정보일련번호") or "")
    holding = clean_html(raw.get("판결요지"))
    case_name = clean_html(raw.get("사건명"))
    full_text = clean_html(raw.get("판례내용")) if store_full_text else None
    case = CourtCase(
        case_no=(raw.get("사건번호") or "").strip(),
        court=_court(raw),
        decided_at=parse_date(raw.get("선고일자")),
        case_name=case_name,
        case_type=(raw.get("사건종류명") or "").strip() or None,
        holding_summary=holding,
        full_text=full_text,
        source=SOURCE,
        source_id=source_id,
        source_url=public_url(source_id) if source_id else None,
        deid_check=deid_status(case_name, holding, full_text),
    )
    return ParsedCase(case=case, raw_refs=split_statute_refs(raw.get("참조조문")))
