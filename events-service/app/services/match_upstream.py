"""Фоновое уведомление match-service о смене состава события (очередь производных на стороне match)."""

from __future__ import annotations

import logging
import os
import threading

import requests

_log = logging.getLogger(__name__)


def notify_match_event_derivatives(event_id: int) -> None:
    base = (os.environ.get("MATCH_SERVICE_URL") or "").strip().rstrip("/")
    token = (os.environ.get("INTERNAL_MATCH_TOKEN") or "").strip()
    if not base or not token:
        return

    eid = int(event_id)

    def _run() -> None:
        try:
            r = requests.post(
                f"{base}/internal/event-derivatives/{eid}",
                headers={"X-Service-Token": token},
                timeout=5,
            )
            if r.status_code >= 400:
                _log.warning(
                    "match derivatives notify failed event_id=%s status=%s body=%s",
                    eid,
                    r.status_code,
                    (r.text or "")[:300],
                )
        except Exception:
            _log.exception("match derivatives notify error event_id=%s", eid)

    threading.Thread(target=_run, daemon=True, name=f"match-deriv-{eid}").start()
