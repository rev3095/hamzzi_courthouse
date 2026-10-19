"""공통 fixture. 네트워크를 쓰지 않는다 — httpx.MockTransport로 법제처 응답을 흉내 낸다."""

import json
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

from hamzzi_collector.config import Settings
from hamzzi_collector.law_api import LawApiClient

FIXTURES = Path(__file__).parent / "fixtures" / "law_open_api"
TEST_KEY = "test-oc-key"


def load(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


@pytest.fixture
def settings() -> Settings:
    return Settings(api_key=TEST_KEY, request_delay_s=0, backoff_base_s=0, max_retries=2)


@pytest.fixture
def make_client(
    settings: Settings,
) -> Callable[[Callable[[httpx.Request], httpx.Response]], LawApiClient]:
    def factory(handler: Callable[[httpx.Request], httpx.Response]) -> LawApiClient:
        return LawApiClient(settings, transport=httpx.MockTransport(handler), sleep=lambda _: None)

    return factory


def route(routes: dict[tuple[str, str, str | None], str | dict]):
    """(경로, target, ID/MST) → fixture 이름 또는 응답 dict. 키 None은 목록 조회."""

    def handler(request: httpx.Request) -> httpx.Response:
        p = request.url.params
        assert p["OC"] == TEST_KEY and p["type"] == "JSON"
        path = request.url.path.rsplit("/", 1)[-1]
        key = (path, p["target"], p.get("ID") or p.get("MST"))
        body = routes[key]
        return httpx.Response(200, json=load(body) if isinstance(body, str) else body)

    return handler
