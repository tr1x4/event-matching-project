"""Простой in-memory TTL-кэш для снижения нагрузки на profiles/events при рекомендациях."""

from __future__ import annotations

import threading
import time
from typing import Any, Callable, TypeVar

T = TypeVar("T")

_lock = threading.RLock()
_store: dict[str, tuple[float, Any]] = {}


def get_cached(key: str) -> Any | None:
    now = time.time()
    with _lock:
        hit = _store.get(key)
        if not hit:
            return None
        exp, val = hit
        if exp <= now:
            del _store[key]
            return None
        return val


def set_cached(key: str, value: Any, ttl_sec: float) -> None:
    with _lock:
        _store[key] = (time.time() + ttl_sec, value)
        if len(_store) > 5000:
            _prune_unlocked()


def invalidate_prefix(prefix: str) -> None:
    """Сброс ключей (например все ответы рекомендаций `rec:`)."""
    with _lock:
        for k in [x for x in _store if x.startswith(prefix)]:
            _store.pop(k, None)


def _prune_unlocked() -> None:
    now = time.time()
    dead = [k for k, v in _store.items() if v[0] <= now]
    for k in dead[:2000]:
        _store.pop(k, None)


def cached_call(key: str, ttl_sec: float, factory: Callable[[], T]) -> T:
    got = get_cached(key)
    if got is not None:
        return got  # type: ignore[return-value]
    val = factory()
    set_cached(key, val, ttl_sec)
    return val
