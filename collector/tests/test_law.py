"""F-004 현행법령 수집: 조문 파싱, 버전별 1행·시행일 관리, ingest_runs 기록."""

from datetime import date

import pytest
from conftest import load, route

from hamzzi_collector.ingest import ingest_laws
from hamzzi_collector.models import LawVersion, Statute
from hamzzi_collector.sources.law_open_api_law import parse_law
from hamzzi_collector.store import InMemoryRepository, plan_law_version

ROUTES = {
    ("lawSearch.do", "eflaw", None): "eflaw_list",
    ("lawService.do", "eflaw", "276291"): "law_body",
}


def test_조문_단위로_파싱하고_장절_제목은_건너뛴다():
    lv = parse_law(load("law_body"), "276291")
    assert (lv.law_id, lv.law_name, lv.version) == ("001248", "주택임대차보호법", "276291")
    assert lv.effective_from == date(2026, 1, 2)
    assert [a.article_no for a in lv.articles] == ["제1조", "제2조", "제3조", "제3조의4"]
    first = lv.articles[0]
    assert first.article_title == "목적"
    assert first.body.startswith("제1조(목적)")
    assert first.source_url == "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=276291&efYd=20260102"


def test_항_호_내용을_본문에_합친다():
    art = parse_law(load("law_body"), "276291").articles[3]
    lines = art.body.splitlines()
    assert lines[0].startswith("제3조의4(")
    assert any(line.startswith("②") for line in lines)
    assert "1. 주민등록을 마친 날" in lines


def test_기본정보_누락이면_오류():
    body = load("law_body")
    body["법령"]["기본정보"]["법령ID"] = ""
    with pytest.raises(ValueError):
        parse_law(body, "276291")


def _art(no: str, body: str, start: date) -> Statute:
    return Statute(
        law_id="L1",
        law_name="테스트법",
        article_no=no,
        article_title=None,
        body=body,
        effective_from=start,
        source_url=None,
        version="v",
    )


def _lv(arts: list[Statute], start: date) -> LawVersion:
    return LawVersion(
        law_id="L1", law_name="테스트법", version="v", effective_from=start, articles=arts
    )


def test_개정된_조문만_새_행을_넣고_이전_행의_effective_to를_닫는다():
    repo = InMemoryRepository()
    d1, d2 = date(2025, 1, 1), date(2026, 1, 1)
    repo.apply_law_version(_lv([_art("제1조", "A", d1), _art("제2조", "B", d1)], d1))
    counts = repo.apply_law_version(_lv([_art("제1조", "A", d2), _art("제2조", "B2", d2)], d2))

    assert counts == {"inserted": 1, "updated": 0, "unchanged": 1}
    rows = {(s.article_no, s.body): s for s in repo.statutes}
    assert rows[("제1조", "A")].effective_to is None  # 변경 없음 → 복제하지 않음
    assert rows[("제2조", "B")].effective_to == d2  # F-004: effective_from ≤ 판결일 < effective_to
    assert rows[("제2조", "B2")].effective_to is None


def test_삭제된_조문은_새_버전_시행일로_닫는다():
    repo = InMemoryRepository()
    d1, d2 = date(2025, 1, 1), date(2026, 1, 1)
    repo.apply_law_version(_lv([_art("제1조", "A", d1), _art("제2조", "B", d1)], d1))
    repo.apply_law_version(_lv([_art("제1조", "A", d2)], d2))
    deleted = next(s for s in repo.statutes if s.article_no == "제2조")
    assert deleted.effective_to == d2


def test_같은_시행일의_정정은_덮어쓰고_시행일을_유지한다():
    d1 = date(2025, 1, 1)
    current = {"제1조": _art("제1조", "A", d1)}
    inserts, overwrites, closes, _ = plan_law_version(
        current, _lv([_art("제1조", "A'", date(2024, 1, 1))], d1)
    )
    assert not inserts and not closes
    assert overwrites[0][1].effective_from == d1


def test_법령_수집_실행(make_client, settings):
    repo = InMemoryRepository()
    stats = ingest_laws(make_client(route(ROUTES)), repo, settings, query="주택임대차보호법")
    assert (stats.fetched, stats.inserted, stats.failed) == (1, 4, 0)
    assert next(iter(repo.runs.values()))["status"] == "ok"
