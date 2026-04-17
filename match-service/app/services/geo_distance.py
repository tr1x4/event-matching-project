"""Расстояния на сфере (км) для фильтра рекомендаций по городу пользователя."""

from __future__ import annotations

import math
from typing import Any


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def filter_events_within_km(
    events: list[dict[str, Any]],
    user_lat: float,
    user_lon: float,
    max_km: float,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for e in events:
        try:
            elat = e.get("latitude")
            elng = e.get("longitude")
            if elat is None or elng is None:
                continue
            d = haversine_km(user_lat, user_lon, float(elat), float(elng))
        except (TypeError, ValueError):
            continue
        if d <= max_km:
            out.append(e)
    return out
