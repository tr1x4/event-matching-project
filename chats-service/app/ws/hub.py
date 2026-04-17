"""Комнаты WebSocket по chat_id."""

from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self._rooms: dict[int, list[WebSocket]] = {}

    async def connect(self, chat_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._rooms.setdefault(chat_id, []).append(ws)

    def disconnect(self, chat_id: int, ws: WebSocket) -> None:
        lst = self._rooms.get(chat_id)
        if not lst:
            return
        if ws in lst:
            lst.remove(ws)
        if not lst:
            del self._rooms[chat_id]

    async def broadcast(self, chat_id: int, payload: dict[str, Any]) -> None:
        lst = list(self._rooms.get(chat_id, []))
        dead: list[WebSocket] = []
        raw = json.dumps(payload, ensure_ascii=False)
        for ws in lst:
            try:
                await ws.send_text(raw)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(chat_id, ws)


hub = Hub()
