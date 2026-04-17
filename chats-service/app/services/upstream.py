from __future__ import annotations

import requests

from app.core.config import settings

_session = requests.Session()
_session.trust_env = False


def fetch_profile_internal(profile_id: int) -> dict | None:
    """Полная карточка профиля (в т.ч. dm_privacy и блок-лист) для межсервисных проверок."""
    base = settings.profiles_service_url.rstrip("/")
    tok = settings.internal_profile_token.strip()
    if not tok:
        return None
    r = _session.get(
        f"{base}/profiles/{int(profile_id)}",
        headers={"X-Service-Token": tok},
        timeout=15,
    )
    if r.status_code != 200:
        return None
    data = r.json()
    if not isinstance(data, dict) or data.get("error"):
        return None
    return data


def have_common_events(profile_a: int, profile_b: int) -> bool:
    base = settings.events_service_url.rstrip("/")
    tok = settings.internal_token.strip()
    r = _session.get(
        f"{base}/internal/common-events-between",
        params={"profile_a": int(profile_a), "profile_b": int(profile_b)},
        headers={"X-Service-Token": tok},
        timeout=15,
    )
    if r.status_code != 200:
        return False
    try:
        j = r.json()
        return bool(j.get("shared"))
    except (ValueError, TypeError, AttributeError):
        return False


def fetch_my_profile(authorization: str) -> dict | None:
    base = settings.profiles_service_url.rstrip("/")
    r = _session.get(f"{base}/profiles/me", headers={"Authorization": authorization}, timeout=15)
    if r.status_code != 200:
        return None
    return r.json()


def fetch_event_public(event_id: int) -> dict | None:
    base = settings.events_service_url.rstrip("/")
    r = _session.get(f"{base}/events/{event_id}", timeout=15)
    if r.status_code != 200:
        return None
    data = r.json()
    if isinstance(data, dict) and data.get("error"):
        return None
    return data


def event_profile_access(profile_id: int, ev: dict) -> tuple[bool, str | None]:
    """True если участник и не в блоке. blocked — только rejoin block list."""
    if not ev:
        return False, "Событие не найдено"
    pid = int(profile_id)
    creator = int(ev.get("creator_profile_id") or 0)
    parts = ev.get("participants") or []
    if not isinstance(parts, list):
        parts = []
    pids = []
    for x in parts:
        try:
            pids.append(int(x))
        except (TypeError, ValueError):
            continue
    blocked = ev.get("blocked_profile_ids") or []
    if not isinstance(blocked, list):
        blocked = []
    bids = []
    for x in blocked:
        try:
            bids.append(int(x))
        except (TypeError, ValueError):
            continue
    if pid in bids:
        return False, "Вы заблокированы в этом событии"
    if pid == creator or pid in pids:
        return True, None
    return False, "Нет доступа к чату этого события"
