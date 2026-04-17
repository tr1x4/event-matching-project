"""Подсказки населённых пунктов РФ через DaData Suggest API (только Россия)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

_DADATA_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address"


class GeoSuggestRateLimited(Exception):
    """Слишком частые запросы к DaData (HTTP 429)."""


class GeoSuggestNotConfigured(Exception):
    """Не задан API-ключ DaData (переменная DADATA_API_KEY или DADATA_TOKEN)."""


class GeoSuggestAuthError(Exception):
    """Ключ DaData отклонён (HTTP 401 / 403)."""


def _pick_label(d: dict) -> str | None:
    """Только название города или НП без приставок «г.», «г.о.» и т.п."""
    city = (d.get("city") or "").strip()
    settlement = (d.get("settlement") or "").strip()
    if city:
        return city
    if settlement:
        return settlement
    return None


def _parse_float_coord(x) -> float | None:
    if x is None:
        return None
    try:
        v = float(str(x).strip())
        if v != v:  # NaN
            return None
        return v
    except (TypeError, ValueError):
        return None


def suggest_russian_cities(query: str, limit: int = 14) -> list[dict[str, float | str]]:
    """
    Возвращает до ``limit`` подсказок: ``{name, lat, lng}``.
    Запрос ограничен Россией (country_iso_code RU), уровень от города до населённого пункта.
    """
    q = (query or "").strip()
    if not q:
        return []

    token = (
        os.environ.get("DADATA_API_KEY", "").strip()
        or os.environ.get("DADATA_TOKEN", "").strip()
    )
    if not token:
        raise GeoSuggestNotConfigured()

    secret = os.environ.get("DADATA_SECRET_KEY", "").strip()

    count = min(max(int(limit), 1), 20)
    body: dict = {
        "query": q,
        "count": count,
        "language": "ru",
        "from_bound": {"value": "city"},
        "to_bound": {"value": "settlement"},
        "locations": [{"country_iso_code": "RU"}],
    }

    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {
        "Content-Type": "application/json; charset=UTF-8",
        "Accept": "application/json",
        "Authorization": f"Token {token}",
    }
    if secret:
        headers["X-Secret"] = secret

    req = urllib.request.Request(_DADATA_URL, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise GeoSuggestRateLimited from e
        if e.code in (401, 403):
            raise GeoSuggestAuthError from e
        return []
    except OSError:
        return []

    try:
        root = json.loads(raw)
    except json.JSONDecodeError:
        return []

    suggestions = root.get("suggestions") if isinstance(root, dict) else None
    if not isinstance(suggestions, list):
        return []

    out: list[dict[str, float | str]] = []
    seen: set[str] = set()

    for item in suggestions:
        if not isinstance(item, dict):
            continue
        data = item.get("data")
        if not isinstance(data, dict):
            continue
        if str(data.get("country_iso_code") or "").upper() != "RU":
            continue

        lat = _parse_float_coord(data.get("geo_lat"))
        lon = _parse_float_coord(data.get("geo_lon"))
        if lat is None or lon is None:
            continue

        # 5: координаты не определены
        if str(data.get("qc_geo") or "").strip() == "5":
            continue

        street = (data.get("street") or "").strip()
        city = (data.get("city") or "").strip()
        settlement = (data.get("settlement") or "").strip()
        if street and not city and not settlement:
            continue

        val_full = str(item.get("value") or item.get("unrestricted_value") or "").lower()
        noise = ("развяз", "трасс", " км ", "километр", "шоссе", "автодорог", "а/д ")
        if any(x in val_full for x in noise):
            continue

        label = _pick_label(data)
        if not label:
            continue

        fias = str(data.get("city_fias_id") or data.get("settlement_fias_id") or data.get("fias_id") or "")
        dedupe = fias if fias else f"{label.casefold()}|{round(lat, 5)}|{round(lon, 5)}"
        if dedupe in seen:
            continue
        seen.add(dedupe)
        out.append({"name": label, "lat": lat, "lng": lon})
        if len(out) >= count:
            break

    return out
