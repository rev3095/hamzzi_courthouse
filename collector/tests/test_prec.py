"""F-003 판례 수집: 파싱·필드 누락·전문 미저장(OQ-DM-05)·증분·ingest_runs 기록."""

from datetime import date, timedelta

import pytest
from conftest import TEST_KEY, load, route
from pydantic import ValidationError

from hamzzi_collector.ingest import ingest_cases
from hamzzi_collector.sources.law_open_api_prec import parse_case
from hamzzi_collector.store import InMemoryRepository


def _list_without_html_only() -> dict:
    # 실제 목록의 두 번째 항목은 국세법령정보시스템(HTML 전용) 출처다. 필드 누락 경로를 보려고 출처만 바꾼다.
    data = load("prec_list")
    data["PrecSearch"]["prec"][1]["데이터출처명"] = "대법원"
    return data


ROUTES = {
    ("lawSearch.do", "prec", None): _list_without_html_only(),
    ("lawService.do", "prec", "621911"): "prec_body",
    ("lawService.do", "prec", "618893"): "prec_body_missing_fields",
}


def test_HTML_전용_출처_판례는_본문을_요청하지_않는다(make_client, settings):
    requested = []
    handler = route({**ROUTES, ("lawSearch.do", "prec", None): "prec_list"})

    def spy(request):
        requested.append(request.url.params.get("ID"))
        return handler(request)

    stats = ingest_cases(make_client(spy), InMemoryRepository(), settings, today=date(2026, 10, 19))
    assert "618893" not in requested
    assert (stats.fetched, stats.inserted, stats.failed) == (1, 1, 0)


def test_정상_본문을_court_cases_필드로_파싱한다():
    parsed = parse_case(load("prec_body"))
    c = parsed.case
    assert (c.case_no, c.court, c.decided_at) == ("2025다220329", "대법원", date(2026, 5, 8))
    assert c.case_type == "민사"
    assert c.source == "law_open_api" and c.source_id == "621911"
    assert c.holding_summary.startswith("[1] 민법 제1026조는")
    assert "<br" not in c.holding_summary
    assert c.deid_check == "passed"
    assert len(c.content_hash) == 64
    assert parsed.raw_refs == ["민법 제1026조 제1호", "민법 제105조", "민법 제1022조"]


def test_원문_링크는_공개_주소이고_인증키가_없다():
    url = parse_case(load("prec_body")).case.source_url
    assert url == "https://www.law.go.kr/LSW/precInfoP.do?precSeq=621911"
    assert "OC" not in url and TEST_KEY not in url


def test_판례_전문은_기본값으로_저장하지_않는다():
    assert parse_case(load("prec_body")).case.full_text is None
    assert "상고를 기각한다" in parse_case(load("prec_body"), store_full_text=True).case.full_text


def test_필수_필드_누락이면_검증_오류():
    with pytest.raises(ValidationError):
        parse_case(load("prec_body_missing_fields"))


def test_PrecService가_없으면_형식_오류():
    with pytest.raises(TypeError):
        parse_case(load("prec_not_found"))


def test_수집_실행은_건수와_실패를_ingest_runs에_남긴다(make_client, settings):
    repo = InMemoryRepository()
    client = make_client(route(ROUTES))
    stats = ingest_cases(client, repo, settings, today=date(2026, 10, 19))

    assert (stats.fetched, stats.inserted, stats.updated, stats.failed) == (2, 1, 0, 1)
    run = next(iter(repo.runs.values()))
    assert run["source"] == "law_open_api_prec"
    assert run["status"] == "partial"
    assert run["error_summary"] == "ValidationError×1"

    # 같은 내용 재수집 → 변경 없음 (content_hash)
    again = ingest_cases(client, repo, settings, today=date(2026, 10, 19))
    assert (again.inserted, again.updated) == (0, 0)


def test_증분_수집은_마지막_성공_실행에서_lookback만큼_앞부터(make_client, settings):
    seen = []
    handler = route(ROUTES)

    def spy(request):
        if request.url.path.endswith("lawSearch.do"):
            seen.append(request.url.params["prncYd"])
        return handler(request)

    repo = InMemoryRepository()
    client = make_client(spy)
    ingest_cases(client, repo, settings, today=date(2026, 10, 19))
    assert seen[0] == "20251019~20261019"  # 첫 실행: 1년

    ingest_cases(client, repo, settings, today=date(2026, 10, 19))
    last = repo.last_success("law_open_api_prec").date()
    expected = last - timedelta(days=settings.lookback_days)
    assert seen[1] == f"{expected:%Y%m%d}~20261019"


def test_목록_단계_예외에도_실행_기록을_failed로_닫는다(make_client, settings):
    # legal-reviewer 권고 5: LawApiError가 아닌 예외에도 ingest_runs가 running으로 남지 않아야 한다
    broken = load("prec_list")
    broken["PrecSearch"]["totalCnt"] = "숫자아님"
    repo = InMemoryRepository()
    client = make_client(route({**ROUTES, ("lawSearch.do", "prec", None): broken}))
    with pytest.raises(ValueError):
        ingest_cases(client, repo, settings, today=date(2026, 10, 19))
    run = next(iter(repo.runs.values()))
    assert run["status"] == "failed"
    assert run["error_summary"] == "ValueError×1"


def test_같은_사건번호_법원의_다른_일련번호는_실패가_아니라_중복_건너뜀(make_client, settings):
    # 실제 판례 100건 중 2건이 사건번호·법원은 같고 판례일련번호만 달랐다
    listing = load("prec_list")
    listing["PrecSearch"]["prec"][1].update(
        {"데이터출처명": "대법원", "판례일련번호": "621912", "사건번호": "2025다220329"}
    )
    twin = load("prec_body")
    twin["PrecService"]["판례정보일련번호"] = "621912"
    routes = {
        ("lawSearch.do", "prec", None): listing,
        ("lawService.do", "prec", "621911"): "prec_body",
        ("lawService.do", "prec", "621912"): twin,
    }
    repo = InMemoryRepository()
    stats = ingest_cases(make_client(route(routes)), repo, settings, today=date(2026, 10, 19))

    assert (stats.fetched, stats.inserted, stats.skipped, stats.failed) == (2, 1, 1, 0)
    assert list(repo.cases) == [("law_open_api", "621911")]
    run = next(iter(repo.runs.values()))
    assert run["status"] == "ok"
    assert run["error_summary"] == "중복 건너뜀×1"
