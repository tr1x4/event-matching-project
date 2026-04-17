"""WebSocket «инбокс»: уведомления о новых сообщениях во всех чатах пользователя."""

from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket


class InboxHub:
    def __init__(self) -> None:
        self._by_user: dict[int, list[WebSocket]] = {}

    async def connect(self, profile_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._by_user.setdefault(int(profile_id), []).append(ws)

    def disconnect(self, profile_id: int, ws: WebSocket) -> None:
        lst = self._by_user.get(int(profile_id))
        if not lst:
            return
        if ws in lst:
            lst.remove(ws)
        if not lst:
            del self._by_user[int(profile_id)]

    async def broadcast_users(self, profile_ids: list[int], payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False)
        for uid in profile_ids:
            lst = list(self._by_user.get(int(uid), []))
            dead: list[WebSocket] = []
            for ws in lst:
                try:
                    await ws.send_text(raw)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.disconnect(int(uid), ws)


inbox_hub = InboxHub()
