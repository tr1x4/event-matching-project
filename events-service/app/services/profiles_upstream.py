"""Запросы к profiles-service от имени пользователя (тот же JWT)."""

from __future__ import annotations

import json
import os

import requests

from app.core.config import settings

_session = requests.Session()
_session.trust_env = False


def profiles_base() -> str:
    return os.environ.get("PROFILES_SERVICE_URL", settings.profiles_service_url).rstrip("/")


def fetch_my_profile(authorization_header: str) -> dict:
    """
    GET /profiles/me с заголовком Authorization как у клиента.
    """
    url = f"{profiles_base()}/profiles/me"
    r = _session.get(url, headers={"Authorization": authorization_header}, timeout=15)
    if r.status_code == 404:
        raise ProfileUpstreamError(404, "Сначала создайте профиль")
    if r.status_code != 200:
        raise ProfileUpstreamError(r.status_code, r.text or "profiles-service недоступен")
    return r.json()


class ProfileUpstreamError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def parse_detail(body: str) -> str | None:
    try:
        j = json.loads(body)
        if isinstance(j, dict):
            d = j.get("detail")
            if isinstance(d, str):
                return d
    except (json.JSONDecodeError, TypeError):
        pass
    return None
