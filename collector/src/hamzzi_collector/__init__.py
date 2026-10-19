"""햄찌법원 수집기. 공식 API에서 법령·판례를 받아 정제·비식별 재검사 후 저장한다.

규칙: docs/research/01_데이터_소스.md, docs/DATA_MODEL.md 2절. 새 소스는 add-crawler 스킬로 추가한다.
"""

import argparse
import sys
from datetime import date

from hamzzi_collector.config import Settings
from hamzzi_collector.law_api import LawApiClient, LawApiError
from hamzzi_collector.store import InMemoryRepository, RunStats


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="hamzzi-collector", description="법제처 Open API 법령·판례 수집기"
    )
    sub = p.add_subparsers(dest="command")
    prec = sub.add_parser("prec", help="판례 증분 수집 (선고일 기준)")
    prec.add_argument(
        "--since", type=date.fromisoformat, help="YYYY-MM-DD, 기본: 마지막 성공 실행 기준"
    )
    prec.add_argument("--until", type=date.fromisoformat)
    prec.add_argument("--query", help="판례명 검색어")
    law = sub.add_parser("law", help="현행 법령 수집 (법령명 또는 시행일 기준 증분)")
    law.add_argument("--query", help="법령명 (예: 주택임대차보호법)")
    law.add_argument("--since", type=date.fromisoformat, help="시행일 YYYY-MM-DD 이후")
    for sp in (prec, law):
        sp.add_argument("--max", type=int, dest="max_items", help="최대 건수")
        sp.add_argument(
            "--dry-run", action="store_true", help="DB 없이 메모리에만 저장하고 건수만 출력"
        )
    sub.add_parser("link-refs", help="판례 참조조문을 수집된 조문과 다시 매칭")
    return p


def _report(name: str, stats: RunStats) -> None:
    print(
        f"{name}: fetched={stats.fetched} inserted={stats.inserted} updated={stats.updated} "
        f"skipped={stats.skipped} "
        f"failed={stats.failed} status={stats.status}"
        + (f" errors=[{stats.error_summary}]" if stats.error_summary else "")
    )


def main(argv: list[str] | None = None) -> int:
    from hamzzi_collector.ingest import ingest_cases, ingest_laws

    parser = _parser()
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    if not args.command:
        parser.print_help()
        return 0

    settings = Settings.from_env()
    if getattr(args, "dry_run", False):
        repo = InMemoryRepository()
    elif settings.db_url:
        from hamzzi_collector.store import PostgresRepository

        repo = PostgresRepository(settings.db_url)
    else:
        print("SUPABASE_DB_URL이 없습니다. DB 없이 확인하려면 --dry-run을 쓰세요.", file=sys.stderr)
        return 2

    if args.command == "link-refs":
        print(f"link-refs: linked={repo.link_statute_refs()}")
        return 0

    client = LawApiClient(settings)
    try:
        if args.command == "prec":
            stats = ingest_cases(
                client,
                repo,
                settings,
                since=args.since,
                until=args.until,
                query=args.query,
                max_items=args.max_items,
            )
        else:
            stats = ingest_laws(
                client, repo, settings, query=args.query, since=args.since, max_items=args.max_items
            )
    except LawApiError as exc:
        print(f"수집 중단: {exc}", file=sys.stderr)
        return 1
    finally:
        client.close()
    _report(args.command, stats)
    return 0 if stats.status != "failed" else 1
