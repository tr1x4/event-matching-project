import json
import os
import threading
import time

import requests

BASE_URL = os.environ.get("PROFILES_SERVICE_URL", "http://127.0.0.1:8001")

session = requests.Session()
session.trust_env = False

_profile_ttl_sec = float(os.environ.get("MATCH_PROFILE_CACHE_TTL", "120"))
_profile_lock = threading.RLock()
_profile_by_id: dict[int, tuple[float, dict]] = {}


class ProfileClientError(Exception):
    """Ошибка ответа profiles-service (пробрасывается в HTTP для клиента)."""

    def __init__(self, status_code: int, body: str = ""):
        self.status_code = status_code
        self.body = body or ""
        super().__init__(f"profiles HTTP {status_code}")


def parse_profiles_error_detail(body: str) -> str | None:
    try:
        j = json.loads(body)
        if isinstance(j, dict):
            d = j.get("detail")
            if isinstance(d, str):
                return d
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def get_my_profile(authorization_header: str):
    """
    Текущий профиль по JWT (заголовок Authorization: Bearer ... целиком).
    """
    url = f"{BASE_URL}/profiles/me"
    response = session.get(
        url,
        headers={"Authorization": authorization_header},
        timeout=10,
    )
    if response.status_code != 200:
        raise ProfileClientError(response.status_code, response.text)
    return response.json()


def get_profile(profile_id: int):
    url = f"{BASE_URL}/profiles/{profile_id}"
    token = (os.environ.get("INTERNAL_PROFILE_TOKEN") or "").strip()
    headers = {}
    if token:
        headers["X-Service-Token"] = token
    response = session.get(url, headers=headers, timeout=10)

    if response.status_code != 200:
        raise Exception(
            f"Failed to fetch profile {profile_id}. "
            f"Status: {response.status_code}. Body: {response.text}"
        )
    data = response.json()
    if isinstance(data, dict) and data.get("error"):
        raise Exception(f"Profile {profile_id} not found")
    return data


def get_profile_cached(profile_id: int) -> dict:
    """Кэш профиля участника (часто повторяются в рекомендациях)."""
    now = time.time()
    with _profile_lock:
        hit = _profile_by_id.get(profile_id)
        if hit and hit[0] > now:
            return hit[1]
    data = get_profile(profile_id)
    with _profile_lock:
        _profile_by_id[profile_id] = (now + _profile_ttl_sec, data)
        if len(_profile_by_id) > 800:
            for k, v in list(_profile_by_id.items())[:400]:
                if v[0] <= now:
                    _profile_by_id.pop(k, None)
    return data