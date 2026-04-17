"""Корневой каталог файлов profiles-service: аватары и медиа-лента, фиксированные подпапки."""

from __future__ import annotations

import os
from pathlib import Path


def storage_root() -> Path:
    """
    Корень данных на диске (volume в Docker обычно `/data`).
    Та же переменная STORAGE_PATH, что и у events-service; по умолчанию `/data`.
    """
    return Path(os.environ.get("STORAGE_PATH", "/data")).expanduser()


def avatar_storage_dir() -> Path:
    return storage_root() / "avatars"


def profile_gallery_storage_dir() -> Path:
    return storage_root() / "profile_gallery"
