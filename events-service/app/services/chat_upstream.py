"""Вызовы chats-service (чаты событий)."""

from __future__ import annotations

import json
import os
import time

import requests

_session = requests.Session()
_session.trust_env = False


def _base() -> str:
    return os.environ.get("CHATS_SERVICE_URL", "http://127.0.0.1:8004").rstrip("/")


def _token() -> str:
    return (os.environ.get("INTERNAL_CHAT_TOKEN") or "dev-internal-chat-token").strip()


def _headers() -> dict[str, str]:
    return {"X-Service-Token": _token(), "Content-Type": "application/json"}


def get_event_chat_id(event_id: int) -> int | None:
    try:
        r = _session.get(f"{_base()}/internal/event-chats/{int(event_id)}/id", headers=_headers(), timeout=8)
        if r.status_code != 200:
            return None
        data = r.json()
        cid = data.get("chat_id")
        return int(cid) if cid is not None else None
    except (requests.RequestException, ValueError, TypeError, json.JSONDecodeError):
        return None


def create_event_chat(event_id: int, title: str, description: str, owner_profile_id: int, avatar_url: str = "") -> int | None:
    """POST /internal/event-chats. При успехе возвращает chat_id из JSON, иначе None."""
    try:
        r = _session.post(
            f"{_base()}/internal/event-chats",
            headers=_headers(),
            json={
                "event_id": int(event_id),
                "title": title,
                "description": description or "",
                "owner_profile_id": int(owner_profile_id),
                "avatar_url": avatar_url or "",
            },
            timeout=15,
        )
        if r.status_code not in (200, 201):
            return None
        data = r.json()
        cid = data.get("chat_id")
        return int(cid) if cid is not None else None
    except (requests.RequestException, ValueError, TypeError, json.JSONDecodeError):
        return None


def add_event_chat_member(event_id: int, profile_id: int) -> None:
    try:
        _session.post(
            f"{_base()}/internal/event-chats/{int(event_id)}/members",
            headers=_headers(),
            json={"profile_id": int(profile_id)},
            timeout=10,
        )
    except requests.RequestException:
        return


def leave_event_chat_member(event_id: int, profile_id: int) -> None:
    try:
        _session.post(
            f"{_base()}/internal/event-chats/{int(event_id)}/members/leave",
            headers=_headers(),
            json={"profile_id": int(profile_id)},
            timeout=10,
        )
    except requests.RequestException:
        return


def delete_event_chat_for_event(event_id: int) -> None:
    try:
        _session.post(
            f"{_base()}/internal/event-chats/{int(event_id)}/soft-delete",
            headers=_headers(),
            timeout=12,
        )
    except requests.RequestException:
        return


def patch_event_chat_meta(
    event_id: int,
    avatar_url: str | None = None,
    title: str | None = None,
    subtitle: str | None = None,
) -> None:
    body: dict[str, str] = {}
    if avatar_url is not None:
        body["avatar_url"] = str(avatar_url)[:512]
    if title is not None:
        body["title"] = str(title)[:300]
    if subtitle is not None:
        body["subtitle"] = str(subtitle)[:8000]
    if not body:
        return
    try:
        _session.patch(
            f"{_base()}/internal/event-chats/{int(event_id)}",
            headers=_headers(),
            json=body,
            timeout=10,
        )
    except requests.RequestException:
        return
