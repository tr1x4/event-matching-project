"""Проверка, что точка события не слишком далеко от координат профиля (тот же город/агломерация)."""

from __future__ import annotations

import math


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def event_within_creator_radius(
    creator_lat: float,
    creator_lon: float,
    event_lat: float,
    event_lon: float,
    max_km: float,
) -> bool:
    return haversine_km(creator_lat, creator_lon, event_lat, event_lon) <= max_km
