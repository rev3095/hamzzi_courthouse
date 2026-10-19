"""저장소. 수집 로직은 Repository 프로토콜에만 의존한다.

- InMemoryRepository: 테스트·--dry-run 용
- PostgresRepository: Supabase Postgres (SUPABASE_DB_URL, 서비스 계정). 운영 DB 반영은 사람이 승인한다.
"""

import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Literal, Protocol

from hamzzi_collector.models import CourtCase, LawVersion, ParsedCase, Statute
from hamzzi_collector.text import parse_ref

UpsertResult = Literal["inserted", "updated", "unchanged"]


@dataclass
class RunStats:
    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    failed: int = 0
    errors: Counter = field(default_factory=Counter)

    def count(self, result: UpsertResult) -> None:
        if result == "inserted":
            self.inserted += 1
        elif result == "updated":
            self.updated += 1

    def fail(self, exc: BaseException) -> None:
        # 오류 유형 이름만 남긴다. 메시지에는 원문·URL이 섞일 수 있다.
        self.failed += 1
        self.errors[type(exc).__name__] += 1

    @property
    def status(self) -> str:
        if self.failed == 0:
            return "ok"
        return "partial" if self.fetched > self.failed else "failed"

    @property
    def error_summary(self) -> str | None:
        if not self.errors:
            return None
        return ", ".join(f"{name}×{n}" for name, n in sorted(self.errors.items()))


class Repository(Protocol):
    def start_run(self, source: str) -> str: ...
    def finish_run(self, run_id: str, stats: RunStats, status: str | None = None) -> None: ...
    def last_success(self, source: str) -> datetime | None: ...
    def upsert_case(self, parsed: ParsedCase) -> UpsertResult: ...
    def apply_law_version(self, lv: LawVersion) -> Counter: ...
    def link_statute_refs(self) -> int: ...


def plan_law_version(
    current: dict[str, Statute], lv: LawVersion
) -> tuple[list[Statute], list[tuple[Statute, Statute]], list[tuple[Statute, date]], int]:
    """현행 조문(article_no→Statute)과 새 버전을 비교해 할 일을 정한다.

    반환: (새로 넣을 조문, (기존, 덮어쓸 조문) 쌍, (닫을 기존 조문, effective_to), 변경 없음 수)
    - 본문·제목이 같으면 그대로 둔다(버전마다 같은 조문을 복제하지 않는다).
    - 바뀌었고 시행일이 더 늦으면 기존 행을 그 시행일로 닫고 새 행을 넣는다.
    - 시행일이 같거나 이르면 원천 정정으로 보고 기존 행을 덮어쓴다.
    - 새 버전에 없는 현행 조문(삭제)은 새 버전 시행일로 닫는다.
    """
    inserts: list[Statute] = []
    overwrites: list[tuple[Statute, Statute]] = []
    closes: list[tuple[Statute, date]] = []
    unchanged = 0
    seen: set[str] = set()
    for art in lv.articles:
        seen.add(art.article_no)
        cur = current.get(art.article_no)
        if cur is None:
            inserts.append(art)
        elif cur.body == art.body and cur.article_title == art.article_title:
            unchanged += 1
        elif art.effective_from > cur.effective_from:
            closes.append((cur, art.effective_from))
            inserts.append(art)
        else:
            # 시행일은 기존 값을 유지해 앞 버전의 effective_to와 어긋나지 않게 한다
            overwrites.append((cur, art.model_copy(update={"effective_from": cur.effective_from})))
    for no, cur in current.items():
        if no not in seen and lv.effective_from > cur.effective_from:
            closes.append((cur, lv.effective_from))
    return inserts, overwrites, closes, unchanged


class InMemoryRepository:
    def __init__(self) -> None:
        self.runs: dict[str, dict] = {}
        self.cases: dict[tuple[str, str], CourtCase] = {}
        self.refs: dict[tuple[str, str], list[str]] = {}
        self.statutes: list[Statute] = []

    def start_run(self, source: str) -> str:
        run_id = str(uuid.uuid4())
        self.runs[run_id] = {"source": source, "started_at": datetime.now(UTC), "status": "running"}
        return run_id

    def finish_run(self, run_id: str, stats: RunStats, status: str | None = None) -> None:
        self.runs[run_id].update(
            finished_at=datetime.now(UTC),
            fetched=stats.fetched,
            inserted=stats.inserted,
            updated=stats.updated,
            failed=stats.failed,
            status=status or stats.status,
            error_summary=stats.error_summary,
        )

    def last_success(self, source: str) -> datetime | None:
        done = [
            r["started_at"]
            for r in self.runs.values()
            if r["source"] == source and r["status"] in ("ok", "partial")
        ]
        return max(done, default=None)

    def upsert_case(self, parsed: ParsedCase) -> UpsertResult:
        case = parsed.case
        key = (case.source, case.source_id)
        old = self.cases.get(key)
        if old is not None and old.content_hash == case.content_hash:
            return "unchanged"
        if old is None and any(
            (c.case_no, c.court) == (case.case_no, case.court) for c in self.cases.values()
        ):
            raise DuplicateCase(case.case_no)
        self.cases[key] = case
        self.refs[key] = list(parsed.raw_refs)
        return "inserted" if old is None else "updated"

    def current_articles(self, law_id: str) -> dict[str, Statute]:
        return {
            s.article_no: s for s in self.statutes if s.law_id == law_id and s.effective_to is None
        }

    def apply_law_version(self, lv: LawVersion) -> Counter:
        inserts, overwrites, closes, unchanged = plan_law_version(
            self.current_articles(lv.law_id), lv
        )
        for cur, end in closes:
            cur.effective_to = end
        for cur, new in overwrites:
            self.statutes[self.statutes.index(cur)] = new
        self.statutes.extend(s.model_copy() for s in inserts)
        return Counter(inserted=len(inserts), updated=len(overwrites), unchanged=unchanged)

    def link_statute_refs(self) -> int:
        return 0  # 메모리 저장소는 매칭 결과를 보관하지 않는다


class DuplicateCase(Exception):
    """같은 (사건번호, 법원)이 다른 원천 ID로 이미 있음."""


class PostgresRepository:  # pragma: no cover - 로컬 Supabase(Docker) 필요
    def __init__(self, db_url: str) -> None:
        import psycopg

        self._conn = psycopg.connect(db_url, autocommit=True)

    def close(self) -> None:
        self._conn.close()

    def start_run(self, source: str) -> str:
        row = self._conn.execute(
            "insert into ingest_runs (source) values (%s) returning id", (source,)
        ).fetchone()
        return str(row[0])

    def finish_run(self, run_id: str, stats: RunStats, status: str | None = None) -> None:
        self._conn.execute(
            """update ingest_runs set finished_at = now(), fetched = %s, inserted = %s,
                 updated = %s, failed = %s, status = %s, error_summary = %s where id = %s""",
            (
                stats.fetched,
                stats.inserted,
                stats.updated,
                stats.failed,
                status or stats.status,
                stats.error_summary,
                run_id,
            ),
        )

    def last_success(self, source: str) -> datetime | None:
        row = self._conn.execute(
            """select max(started_at) from ingest_runs
               where source = %s and status in ('ok', 'partial')""",
            (source,),
        ).fetchone()
        return row[0] if row else None

    def upsert_case(self, parsed: ParsedCase) -> UpsertResult:
        c = parsed.case
        values = (
            c.case_no,
            c.court,
            c.decided_at,
            c.case_name,
            c.case_type,
            c.holding_summary,
            c.full_text,
            c.source_url,
            c.content_hash,
            c.deid_check,
        )
        with self._conn.transaction():
            row = self._conn.execute(
                "select id, content_hash from court_cases where source = %s and source_id = %s",
                (c.source, c.source_id),
            ).fetchone()
            if row and row[1] == c.content_hash:
                return "unchanged"
            if row:
                case_id = row[0]
                self._conn.execute(
                    """update court_cases set case_no = %s, court = %s, decided_at = %s,
                         case_name = %s, case_type = %s, holding_summary = %s, full_text = %s,
                         source_url = %s, content_hash = %s, deid_check = %s, collected_at = now()
                       where id = %s""",
                    (*values, case_id),
                )
                self._conn.execute("delete from case_statute_refs where case_id = %s", (case_id,))
            else:
                case_id = self._conn.execute(
                    """insert into court_cases (case_no, court, decided_at, case_name, case_type,
                         holding_summary, full_text, source_url, content_hash, deid_check,
                         source, source_id)
                       values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                    (*values, c.source, c.source_id),
                ).fetchone()[0]
            for raw in parsed.raw_refs:
                self._conn.execute(
                    "insert into case_statute_refs (case_id, raw_ref, statute_id) values (%s, %s, %s)",
                    (case_id, raw, self._match_statute(raw, c.decided_at)),
                )
        return "updated" if row else "inserted"

    def _match_statute(self, raw_ref: str, decided_at: date | None):
        parsed = parse_ref(raw_ref)
        if parsed is None or decided_at is None:
            return None
        # F-004: 판결 당시 법령 = effective_from ≤ decided_at < effective_to
        row = self._conn.execute(
            """select id from statutes where law_name = %s and article_no = %s
                 and effective_from <= %s and (effective_to is null or %s < effective_to)
               order by effective_from desc limit 1""",
            (*parsed, decided_at, decided_at),
        ).fetchone()
        return row[0] if row else None

    def apply_law_version(self, lv: LawVersion) -> Counter:
        with self._conn.transaction():
            rows = self._conn.execute(
                """select id, law_id, law_name, article_no, article_title, body, effective_from,
                     source_url, version from statutes where law_id = %s and effective_to is null""",
                (lv.law_id,),
            ).fetchall()
            ids = {r[3]: r[0] for r in rows}
            current = {
                r[3]: Statute(
                    law_id=r[1],
                    law_name=r[2],
                    article_no=r[3],
                    article_title=r[4],
                    body=r[5],
                    effective_from=r[6],
                    source_url=r[7],
                    version=r[8],
                )
                for r in rows
            }
            inserts, overwrites, closes, unchanged = plan_law_version(current, lv)
            for cur, end in closes:
                self._conn.execute(
                    "update statutes set effective_to = %s where id = %s",
                    (end, ids[cur.article_no]),
                )
            for cur, new in overwrites:
                self._conn.execute(
                    """update statutes set law_name = %s, article_title = %s, body = %s,
                         effective_from = %s, source_url = %s, version = %s where id = %s""",
                    (
                        new.law_name,
                        new.article_title,
                        new.body,
                        new.effective_from,
                        new.source_url,
                        new.version,
                        ids[cur.article_no],
                    ),
                )
            for s in inserts:
                self._conn.execute(
                    """insert into statutes (law_id, law_name, article_no, article_title, body,
                         effective_from, source_url, version)
                       values (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        s.law_id,
                        s.law_name,
                        s.article_no,
                        s.article_title,
                        s.body,
                        s.effective_from,
                        s.source_url,
                        s.version,
                    ),
                )
        return Counter(inserted=len(inserts), updated=len(overwrites), unchanged=unchanged)

    def link_statute_refs(self) -> int:
        rows = self._conn.execute(
            """select r.case_id, r.raw_ref, c.decided_at from case_statute_refs r
               join court_cases c on c.id = r.case_id where r.statute_id is null"""
        ).fetchall()
        linked = 0
        for case_id, raw_ref, decided_at in rows:
            statute_id = self._match_statute(raw_ref, decided_at)
            if statute_id:
                self._conn.execute(
                    "update case_statute_refs set statute_id = %s where case_id = %s and raw_ref = %s",
                    (statute_id, case_id, raw_ref),
                )
                linked += 1
        return linked
