"""Дата/время начала, длительность и отображаемый статус события."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

DURATION_DAYS: dict[str, int] = {
    "d1": 1,
    "d2": 2,
    "d3": 3,
    "d4": 4,
    "d5": 5,
    "d6": 6,
    "week": 7,
    "longer": 30,
}

ALLOWED_DURATION = frozenset(DURATION_DAYS)
ALLOWED_BUCKET = frozenset({"p2", "p3_4", "p5_9", "p10_plus"})

BUCKET_TO_EXPECTED: dict[str, int] = {
    "p2": 2,
    "p3_4": 4,
    "p5_9": 7,
    "p10_plus": 15,
}


def parse_starts_at(raw: str | None) -> datetime | None:
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def event_end_utc(starts_at: datetime, duration_key: str) -> datetime:
    days = DURATION_DAYS.get(duration_key, 1)
    return starts_at + timedelta(days=days)


def compute_event_status(
    starts_at_raw: str | None,
    duration_key: str | None,
    completed_flag: bool,
    now: datetime | None = None,
) -> str:
    """
    planned — до начала; active — после начала, пока автор не отметил завершение;
    completed — только по флагу организатора (авто по дате окончания не ставим).
    """
    now = now or datetime.now(timezone.utc)
    if completed_flag:
        return "completed"
    start = parse_starts_at(starts_at_raw)
    if start is None:
        return "planned"
    if now < start:
        return "planned"
    return "active"


def event_dict_augmented(event: Any, base: dict[str, Any]) -> dict[str, Any]:
    """Добавляет к словарю события вычисляемые поля."""
    starts = getattr(event, "starts_at", None) or ""
    dk = getattr(event, "duration_key", None) or "d1"
    completed = bool(getattr(event, "completed_flag", 0))
    status = compute_event_status(str(starts) if starts else None, str(dk) if dk else None, completed)
    out = {
        **base,
        "starts_at": str(starts) if starts else None,
        "duration_key": str(dk) if dk else "d1",
        "participant_bucket": getattr(event, "participant_bucket", None) or "p3_4",
        "completed_flag": completed,
        "hidden_from_discovery": bool(getattr(event, "hidden_from_discovery", 0)),
        "status": status,
    }
    return out
