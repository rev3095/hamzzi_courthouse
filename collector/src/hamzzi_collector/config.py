"""수집기 설정. 비밀값은 환경변수로만 받는다 (코드·테스트·로그에 쓰지 않는다)."""

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    # repr에서 빼서 print(settings)·로그로 인증키·DB 비밀번호가 새지 않게 한다
    api_key: str = field(repr=False)
    db_url: str | None = field(default=None, repr=False)
    base_url: str = "https://www.law.go.kr/DRF"
    timeout_s: float = 30.0
    max_retries: int = 4
    backoff_base_s: float = 1.0
    request_delay_s: float = 0.5
    page_size: int = 100
    # 증분 수집 시 마지막 성공 실행보다 이만큼 앞부터 다시 본다 (판례는 선고 후 늦게 등록되기도 함)
    lookback_days: int = 90
    # OQ-DM-05 확정 전까지 판례 전문을 저장하지 않는다
    store_full_text: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        key = os.environ.get("OPEN_LAW_API_KEY", "").strip()
        if not key:
            raise SystemExit(
                "OPEN_LAW_API_KEY 환경변수가 없습니다. 프로젝트 루트 .env.local에 설정하세요."
            )
        env = os.environ.get
        return cls(
            api_key=key,
            db_url=env("SUPABASE_DB_URL") or None,
            timeout_s=float(env("COLLECTOR_TIMEOUT_S", "30")),
            max_retries=int(env("COLLECTOR_MAX_RETRIES", "4")),
            request_delay_s=float(env("COLLECTOR_REQUEST_DELAY_S", "0.5")),
            lookback_days=int(env("COLLECTOR_LOOKBACK_DAYS", "90")),
            store_full_text=env("COLLECTOR_STORE_FULL_TEXT", "0") == "1",
        )
