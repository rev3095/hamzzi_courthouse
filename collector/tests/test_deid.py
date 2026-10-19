"""F-007 / add-crawler 1-3: 저장 전 비식별 재검사. 아래 값은 모두 가짜 테스트 값이다."""

import pytest
from conftest import load

from hamzzi_collector.deid import deid_status, find_pii
from hamzzi_collector.sources.law_open_api_prec import parse_case


@pytest.mark.parametrize(
    ("text", "kind"),
    [
        ("주민등록번호 900101-1234567 기재", "resident_no"),
        ("연락처 010-1234-5678로 통지", "mobile"),
        ("사무실 02-123-4567", "phone"),
        ("서울특별시 강남구 테헤란로 123에 거주", "road_address"),
        ("역삼동 123-45번지 소재", "lot_address"),
        ("피고 홍길동은 원고에게", "named_party"),
        ("피해자 김철수(가명)의 진술", "named_party"),
        # 회귀 (legal-reviewer 권고 1): 이름 끝 글자가 조사와 같은 경우, 2자 이름, 추가 역할어
        ("원고 김지은은 청구하였다", "named_party"),
        ("피고 박하은의 주장", "named_party"),
        ("원고 김철은 청구하였다", "named_party"),
        ("소외 김철수의 진술", "named_party"),
        ("망 이영희의 상속인", "named_party"),
        ("피고 남궁민수에게", "named_party"),
    ],
)
def test_PII_패턴은_flagged(text, kind):
    assert kind in find_pii(text)
    assert deid_status(text) == "flagged"


@pytest.mark.parametrize(
    "text",
    [
        "피고 1은 원고 A에게 금원을 지급하라",
        "피고인 甲이 피해자 乙을 폭행하였다",
        "원고 회사의 청구를 기각한다",
        "피고 대한민국은",
        "피고 국가는 배상할 책임이 있다",
        "피고 한국전력공사가 설치한",
        "피고 정부는 배상하라",
        "원고 주장을 배척한다",
        "원고 조합의 총회 결의",
        "피고 주식회사는",
        "원고 김○○은",
        "서울 ○○구 ○○로 123",
        "대법원 2004. 3. 12. 선고 2003다63586 판결",
    ],
)
def test_비실명_처리된_표현은_passed(text):
    assert find_pii(text) == []


def test_결과에는_패턴_이름만_남고_원문은_없다():
    hits = find_pii("010-1234-5678")
    assert hits == ["mobile"]


def test_판결요지에_PII가_남아_있으면_판례가_flagged():
    body = load("prec_body")
    body["PrecService"]["판결요지"] += " 연락처 010-1234-5678"
    assert parse_case(body).case.deid_check == "flagged"


def test_실제_판례_fixture는_passed():
    assert parse_case(load("prec_body")).case.deid_check == "passed"
