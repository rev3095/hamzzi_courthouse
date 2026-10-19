"""증분 수집 실행. 실행마다 ingest_runs에 건수·실패를 남긴다 (add-crawler 1-4, PRD 9.3)."""

from datetime import date, timedelta

from hamzzi_collector.config import Settings
from hamzzi_collector.law_api import LawApiAuthError, LawApiClient
from hamzzi_collector.sources import law_open_api_law as law_src
from hamzzi_collector.sources import law_open_api_prec as prec_src
from hamzzi_collector.store import Repository, RunStats

FIRST_RUN_DAYS = 365


def _since(repo: Repository, source: str, settings: Settings, today: date) -> date:
    last = repo.last_success(source)
    if last is None:
        return today - timedelta(days=FIRST_RUN_DAYS)
    return last.date() - timedelta(days=settings.lookback_days)


def ingest_cases(
    client: LawApiClient,
    repo: Repository,
    settings: Settings,
    *,
    since: date | None = None,
    until: date | None = None,
    query: str | None = None,
    max_items: int | None = None,
    today: date | None = None,
) -> RunStats:
    today = today or date.today()
    since = since or _since(repo, prec_src.RUN_SOURCE, settings, today)
    stats = RunStats()
    run_id = repo.start_run(prec_src.RUN_SOURCE)
    try:
        for item in prec_src.list_cases(
            client,
            since,
            until or today,
            query=query,
            page_size=settings.page_size,
            max_items=max_items,
        ):
            stats.fetched += 1
            try:
                body = prec_src.fetch_case(client, str(item.get("판례일련번호") or ""))
                parsed = prec_src.parse_case(body, store_full_text=settings.store_full_text)
                stats.count(repo.upsert_case(parsed))
            except LawApiAuthError:
                raise
            # 파싱·검증·DB 제약 위반 등 — 한 건 실패로 전체를 멈추지 않는다
            except Exception as exc:  # noqa: BLE001
                stats.fail(exc)
    except BaseException as exc:
        # 목록 단계 오류·DB 오류·중단(Ctrl+C)에도 실행 기록이 running으로 남지 않게 닫는다
        stats.fail(exc)
        repo.finish_run(run_id, stats, status="failed")
        raise
    repo.finish_run(run_id, stats)
    return stats


def ingest_laws(
    client: LawApiClient,
    repo: Repository,
    settings: Settings,
    *,
    query: str | None = None,
    since: date | None = None,
    max_items: int | None = None,
    today: date | None = None,
) -> RunStats:
    """query가 있으면 그 법령명으로, 없으면 시행일 범위(증분)로 현행 법령을 받는다."""
    today = today or date.today()
    if not query:
        since = since or _since(repo, law_src.RUN_SOURCE, settings, today)
    stats = RunStats()
    run_id = repo.start_run(law_src.RUN_SOURCE)
    try:
        for item in law_src.list_laws(
            client,
            query=query,
            effective_since=since,
            until=today,
            page_size=settings.page_size,
            max_items=max_items,
        ):
            stats.fetched += 1
            try:
                mst = str(item.get("법령일련번호") or "")
                body = law_src.fetch_law(client, mst, str(item.get("시행일자") or ""))
                counts = repo.apply_law_version(law_src.parse_law(body, mst))
                stats.inserted += counts["inserted"]
                stats.updated += counts["updated"]
            except LawApiAuthError:
                raise
            except Exception as exc:  # noqa: BLE001 — 한 건 실패로 전체를 멈추지 않는다
                stats.fail(exc)
    except BaseException as exc:
        # 목록 단계 오류·DB 오류·중단(Ctrl+C)에도 실행 기록이 running으로 남지 않게 닫는다
        stats.fail(exc)
        repo.finish_run(run_id, stats, status="failed")
        raise
    repo.finish_run(run_id, stats)
    return stats
