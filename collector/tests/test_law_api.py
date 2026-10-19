"""F-003 9.1 법제처 API 클라이언트: 재시도·오류 응답·인증키 비노출."""

import httpx
import pytest
from conftest import TEST_KEY, load

from hamzzi_collector.law_api import LawApiAuthError, LawApiError, LawApiNotFound


def test_429_5xx는_지수_백오프로_재시도한다(make_client):
    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) < 3:
            return httpx.Response(429 if len(calls) == 1 else 503)
        return httpx.Response(200, json=load("prec_list"))

    data = make_client(handler).search("prec")
    assert len(calls) == 3
    assert data["PrecSearch"]["totalCnt"] == "2"


def test_재시도_초과시_오류(make_client):
    with pytest.raises(LawApiError, match="HTTP 500"):
        make_client(lambda r: httpx.Response(500)).search("prec")


def test_네트워크_오류도_재시도한다(make_client):
    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) == 1:
            raise httpx.ConnectError("boom")
        return httpx.Response(200, json=load("prec_list"))

    make_client(handler).search("prec")
    assert len(calls) == 2


def test_인증_실패는_재시도하지_않고_키를_노출하지_않는다(make_client):
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(200, json=load("auth_error"))

    with pytest.raises(LawApiAuthError) as exc:
        make_client(handler).search("prec")
    assert len(calls) == 1
    assert TEST_KEY not in str(exc.value)


def test_자료_없음_응답(make_client):
    with pytest.raises(LawApiNotFound):
        make_client(lambda r: httpx.Response(200, json=load("prec_not_found"))).service(
            "prec", ID="1"
        )


def test_JSON이_아닌_응답(make_client):
    with pytest.raises(LawApiError, match="JSON 아님"):
        make_client(lambda r: httpx.Response(200, text="<html>")).search("prec")


def test_설정_repr에_비밀값이_없다():
    # legal-reviewer 권고 4
    from hamzzi_collector.config import Settings

    text = repr(Settings(api_key=TEST_KEY, db_url="postgresql://u:pw-secret@h/db"))
    assert TEST_KEY not in text and "pw-secret" not in text
