"""법제처 국가법령정보 공동활용 Open API 클라이언트 (lawSearch.do / lawService.do).

인증키(OC)는 쿼리 파라미터로만 보내고, 예외 메시지·로그에는 남기지 않는다.
"""

import logging
import time
from collections.abc import Callable
from typing import Any

import httpx

from hamzzi_collector.config import Settings

# httpx는 INFO 로그에 요청 URL(=OC 포함)을 남기므로 끈다.
logging.getLogger("httpx").setLevel(logging.WARNING)

RETRY_STATUS = {429, 500, 502, 503, 504}


class LawApiError(Exception):
    """API 호출 실패. 메시지에 인증키·URL을 넣지 않는다."""


class LawApiAuthError(LawApiError):
    """인증키·등록 IP 검증 실패. 재시도하지 않는다."""


class LawApiNotFound(LawApiError):
    """요청한 ID의 자료가 없음."""


def scrub(text: str, secret: str) -> str:
    return text.replace(secret, "<OC>") if secret else text


class LawApiClient:
    def __init__(
        self,
        settings: Settings,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._s = settings
        self._sleep = sleep
        self._http = httpx.Client(
            base_url=settings.base_url, timeout=settings.timeout_s, transport=transport
        )
        self._last_request = 0.0

    def close(self) -> None:
        self._http.close()

    def search(self, target: str, **params: Any) -> dict:
        return self._get("lawSearch.do", target, params)

    def service(self, target: str, **params: Any) -> dict:
        return self._get("lawService.do", target, params)

    def _get(self, path: str, target: str, params: dict) -> dict:
        query = {"OC": self._s.api_key, "target": target, "type": "JSON", **params}
        for attempt in range(self._s.max_retries + 1):
            self._throttle()
            try:
                resp = self._http.get(path, params=query)
            except httpx.TransportError as e:
                if attempt == self._s.max_retries:
                    raise LawApiError(
                        f"{path} {target}: 네트워크 오류 {type(e).__name__}"
                    ) from None
                self._backoff(attempt)
                continue
            if resp.status_code in RETRY_STATUS and attempt < self._s.max_retries:
                self._backoff(attempt)
                continue
            if resp.status_code != 200:
                raise LawApiError(f"{path} {target}: HTTP {resp.status_code}")
            return self._parse(resp, path, target)
        raise LawApiError(f"{path} {target}: 재시도 초과")  # pragma: no cover

    def _parse(self, resp: httpx.Response, path: str, target: str) -> dict:
        try:
            data = resp.json()
        except ValueError:
            raise LawApiError(f"{path} {target}: JSON 아님") from None
        if not isinstance(data, dict):
            raise LawApiError(f"{path} {target}: 예상하지 못한 응답 형태")
        # 인증 실패: {"result": "사용자 정보 검증에 실패하였습니다.", "msg": "..."}
        if "result" in data and "검증" in str(data.get("result")):
            raise LawApiAuthError(f"{path} {target}: 사용자 검증 실패(인증키 또는 등록 IP 확인)")
        # 자료 없음: {"Law": "일치하는 판례가 없습니다. ..."}
        if set(data) == {"Law"} and isinstance(data["Law"], str):
            raise LawApiNotFound(f"{path} {target}: 자료 없음")
        return data

    def _throttle(self) -> None:
        wait = self._s.request_delay_s - (time.monotonic() - self._last_request)
        if wait > 0:
            self._sleep(wait)
        self._last_request = time.monotonic()

    def _backoff(self, attempt: int) -> None:
        self._sleep(self._s.backoff_base_s * (2**attempt))
