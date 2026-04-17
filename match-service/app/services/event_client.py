import os
import threading
import time

import requests

BASE_URL = os.environ.get("EVENTS_SERVICE_URL", "http://127.0.0.1:8002")

session = requests.Session()
session.trust_env = False

_events_lock = threading.RLock()
_events_cache: list | None = None
_events_exp: float = 0.0
_events_ttl = float(os.environ.get("MATCH_EVENTS_CACHE_TTL", "45"))


def get_events():
    """
    Получает список всех событий из events-service.
    """

    url = f"{BASE_URL}/events"

    response = session.get(url, timeout=5)

    if response.status_code != 200:
        raise Exception(
            f"Failed to fetch events. "
            f"Status: {response.status_code}. Body: {response.text}"
        )

    return response.json()


def clear_events_cache() -> None:
    """Сброс кэша списка событий (после изменения состава участников и т.п.)."""
    global _events_cache, _events_exp
    with _events_lock:
        _events_cache = None
        _events_exp = 0.0


def get_event(event_id: int):
    """Одно событие по id (для фонового пересчёта производных match)."""
    url = f"{BASE_URL}/events/{int(event_id)}"
    response = session.get(url, timeout=5)
    if response.status_code != 200:
        raise Exception(
            f"Failed to fetch event {event_id}. Status: {response.status_code}. Body: {response.text}"
        )
    return response.json()


def get_events_cached():
    """Список событий с коротким TTL — рекомендации опрашивают его часто."""
    global _events_cache, _events_exp
    now = time.time()
    with _events_lock:
        if _events_cache is not None and now < _events_exp:
            return _events_cache
    data = get_events()
    with _events_lock:
        _events_cache = data if isinstance(data, list) else []
        _events_exp = now + _events_ttl
    return _events_cache