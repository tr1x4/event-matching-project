"""Фильтрация списка событий для выдачи в рекомендациях."""

from __future__ import annotations

from typing import Any


def filter_events_for_recommendations(
    events: list[dict[str, Any]],
    my_profile_id: int,
) -> list[dict[str, Any]]:
    """
    Исключаем: созданные текущим пользователем, скрытые из поиска, не в статусе «планируется».
    """
    out: list[dict[str, Any]] = []
    for e in events:
        if not isinstance(e, dict):
            continue
        try:
            if int(e.get("creator_profile_id") or 0) == int(my_profile_id):
                continue
        except (TypeError, ValueError):
            continue
        parts_raw = e.get("participants") or []
        if isinstance(parts_raw, list):
            pids: list[int] = []
            for x in parts_raw:
                try:
                    pids.append(int(x))
                except (TypeError, ValueError):
                    continue
            if int(my_profile_id) in pids:
                continue
        if e.get("hidden_from_discovery"):
            continue
        if str(e.get("status") or "") != "planned":
            continue
        out.append(e)
    return out
