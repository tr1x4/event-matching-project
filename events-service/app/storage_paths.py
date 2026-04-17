"""Корневой каталог файлов events-service: медиа событий, фиксированная подпапка."""

from __future__ import annotations

import os
from pathlib import Path


def storage_root() -> Path:
    """
    Корень данных на диске (volume в Docker обычно `/data`).
    Переменная окружения STORAGE_PATH, по умолчанию `/data`.
    """
    return Path(os.environ.get("STORAGE_PATH", "/data")).expanduser()


def event_media_storage_dir() -> Path:
    return storage_root() / "event_media"
