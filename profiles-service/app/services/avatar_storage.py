"""Сохранение файлов аватаров: подкаталог `avatars` внутри STORAGE_PATH (см. app.storage_paths)."""

from __future__ import annotations

from pathlib import Path

from app.storage_paths import avatar_storage_dir

AVATAR_DIR: Path = avatar_storage_dir()
PUBLIC_PREFIX = "/media/avatars"

MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

MAX_BYTES = 50 * 1024 * 1024


def ensure_dir() -> None:
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)


def _normalize_content_type(content_type: str | None) -> str:
    if not content_type:
        return ""
    return content_type.split(";")[0].strip().lower()


def save_user_avatar(user_id: int, raw: bytes, content_type: str | None) -> str:
    ct = _normalize_content_type(content_type)
    ext = MIME_TO_EXT.get(ct)
    if not ext:
        raise ValueError("unsupported_mime")
    if len(raw) > MAX_BYTES:
        raise ValueError("too_large")
    if len(raw) < 32:
        raise ValueError("empty_file")

    ensure_dir()
    for suffix in (".jpg", ".png", ".webp"):
        p = AVATAR_DIR / f"{user_id}{suffix}"
        if p.exists():
            p.unlink()

    out = AVATAR_DIR / f"{user_id}{ext}"
    out.write_bytes(raw)
    return f"{PUBLIC_PREFIX}/{user_id}{ext}"


def delete_user_files(user_id: int) -> None:
    for suffix in (".jpg", ".png", ".webp"):
        p = AVATAR_DIR / f"{user_id}{suffix}"
        if p.exists():
            p.unlink()
