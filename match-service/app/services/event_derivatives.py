"""
Фоновый пересчёт вектора личности «события» для матчинга + кэш.

Очередь срабатывает при уведомлении от events-service (создание/участники);
при обработке снимаются кэши списка событий и ответов рекомендаций, чтобы подбор подтянул актуальные данные.
"""

from __future__ import annotations

import logging
import queue
import threading
import time
from typing import Callable

from app.models.user import User
from app.services import ttl_cache
from app.services.event_client import clear_events_cache, get_event
from app.services.matching import compute_personality_vec_for_event_data
from app.services.profile_client import get_profile_cached

_log = logging.getLogger(__name__)

_lock = threading.RLock()
# event_id -> (sorted participant ids tuple, personality vector)
_personality_by_event: dict[int, tuple[tuple[int, ...], list[float]]] = {}
_pending: set[int] = set()
_q: queue.Queue[int] = queue.Queue()
_worker: threading.Thread | None = None
_stop = threading.Event()


def get_personality_vec(event_id: int, participant_ids: tuple[int, ...]) -> list[float] | None:
    with _lock:
        hit = _personality_by_event.get(int(event_id))
        if not hit:
            return None
        pids, vec = hit
        if pids != participant_ids:
            return None
        return list(vec)


def put_personality_vec(event_id: int, participant_ids: tuple[int, ...], vec: list[float]) -> None:
    with _lock:
        _personality_by_event[int(event_id)] = (participant_ids, list(vec))


def delete_personality_vec(event_id: int) -> None:
    with _lock:
        _personality_by_event.pop(int(event_id), None)


def enqueue_event_rebuild(event_id: int) -> None:
    """Постановка в очередь (дедупликация подряд идущих одинаковых id)."""
    eid = int(event_id)
    with _lock:
        if eid in _pending:
            return
        _pending.add(eid)
    _q.put(eid)


def _invalidate_upstream_caches() -> None:
    ttl_cache.invalidate_prefix("rec:")
    clear_events_cache()


def _rebuild_one(event_id: int) -> None:
    raw = get_event(event_id)
    if not isinstance(raw, dict) or raw.get("error"):
        delete_personality_vec(event_id)
        _invalidate_upstream_caches()
        return

    def resolver(pid: int) -> User:
        p = get_profile_cached(int(pid))
        return User(
            id=int(p["id"]),
            personality=p["personality"],
            interests=p["interests"],
        )

    try:
        vec = compute_personality_vec_for_event_data(raw, resolver)
    except Exception:
        _log.exception("event derivative rebuild failed for event_id=%s", event_id)
        delete_personality_vec(event_id)
        _invalidate_upstream_caches()
        return

    pids = tuple(sorted(int(x) for x in (raw.get("participants") or [])))
    put_personality_vec(event_id, pids, vec)
    _invalidate_upstream_caches()


def _worker_loop() -> None:
    while not _stop.is_set():
        try:
            eid = _q.get(timeout=0.5)
        except queue.Empty:
            continue
        try:
            with _lock:
                _pending.discard(int(eid))
            _rebuild_one(int(eid))
        except Exception:
            _log.exception("derivative worker error event_id=%s", eid)
        finally:
            try:
                _q.task_done()
            except ValueError:
                pass


def start_worker_thread() -> None:
    global _worker
    if _worker is not None and _worker.is_alive():
        return
    _stop.clear()
    _worker = threading.Thread(target=_worker_loop, name="event-derivatives", daemon=True)
    _worker.start()
    _log.info("event derivatives worker started")


def stop_worker_thread() -> None:
    _stop.set()
    global _worker
    if _worker is not None:
        _worker.join(timeout=2.0)
        _worker = None
