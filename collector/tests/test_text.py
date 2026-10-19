"""원천 텍스트 정리: 날짜, HTML, 참조조문 분리 (F-004 매칭 입력)."""

from datetime import date

import pytest

from hamzzi_collector.text import article_no, clean_html, parse_date, parse_ref, split_statute_refs


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("20260508", date(2026, 5, 8)),
        ("2026.05.08", date(2026, 5, 8)),
        ("2026. 5. 8.", date(2026, 5, 8)),
        ("", None),
        (None, None),
        ("20261340", None),
    ],
)
def test_parse_date(raw, expected):
    assert parse_date(raw) == expected


def test_clean_html():
    assert clean_html("<br/> [1] 가 &amp; 나<br/><br/>  다  ") == "[1] 가 & 나\n다"
    assert clean_html("<br/>") is None


def test_article_no():
    assert article_no("3") == "제3조"
    assert article_no("3", "4") == "제3조의4"
    assert article_no(10, "") == "제10조"


def test_참조조문은_앞_법령명을_이어_붙인다():
    raw = " [1] 민법 제1026조 제1호 / [2] 민법 제105조 / [3] 민법 제105조, 제1022조, 제1026조 제1호 <br/>"
    assert split_statute_refs(raw) == ["민법 제1026조 제1호", "민법 제105조", "민법 제1022조"]


def test_괄호_안_쉼표로_나누지_않는다():
    raw = "구 소득세법(2009. 12. 31. 법률 제9897호로 개정되기 전의 것, 이하 같다) 제94조, 제95조"
    refs = split_statute_refs(raw)
    assert refs[0].endswith("제94조") and refs[1].endswith("제95조")
    assert len(refs) == 2


def test_parse_ref():
    assert parse_ref("민법 제1026조 제1호") == ("민법", "제1026조")
    assert parse_ref("주택임대차보호법 제3조의4 제2항") == ("주택임대차보호법", "제3조의4")
    assert parse_ref("구 소득세법(2009. 12. 31. 개정 전) 제94조") is None
