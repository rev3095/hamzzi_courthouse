"""저장 레코드. 필드명은 DATA_MODEL.md 2절 컬럼명과 같다."""

import hashlib
import json
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator


def _required(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("빈 값")
    return value


class CourtCase(BaseModel):
    case_no: str
    court: str
    decided_at: date | None
    case_name: str | None
    case_type: str | None
    holding_summary: str | None
    full_text: str | None = None
    source: str
    source_id: str
    source_url: str | None
    deid_check: Literal["pending", "passed", "flagged"] = "pending"

    _strip = field_validator("case_no", "court", "source", "source_id")(_required)

    @property
    def content_hash(self) -> str:
        payload = self.model_dump(mode="json", exclude={"deid_check"})
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


class ParsedCase(BaseModel):
    case: CourtCase
    # case_statute_refs.raw_ref — 매칭(statute_id)은 저장 단계에서 한다
    raw_refs: list[str] = Field(default_factory=list)


class Statute(BaseModel):
    law_id: str
    law_name: str
    article_no: str
    article_title: str | None
    body: str
    effective_from: date
    effective_to: date | None = None
    source_url: str | None
    version: str

    _strip = field_validator("law_id", "law_name", "article_no", "body", "version")(_required)


class LawVersion(BaseModel):
    """법령 한 버전(법령일련번호)의 조문 전체."""

    law_id: str
    law_name: str
    version: str
    effective_from: date
    articles: list[Statute]
