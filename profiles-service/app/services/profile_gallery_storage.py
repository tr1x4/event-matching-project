"""Медиа-лента профиля (отдельно от аватара): несколько фото и видео, лимит размера на файл."""

from __future__ import annotations

import uuid
from pathlib import Path

from app.storage_paths import profile_gallery_storage_dir

GALLERY_ROOT: Path = profile_gallery_storage_dir()
PUBLIC_PREFIX = "/media/profile-gallery"

KIND_IMAGE = "image"
KIND_VIDEO = "video"

IMAGE_MIMES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
VIDEO_MIMES = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
}

MAX_IMAGE_BYTES = 50 * 1024 * 1024
MAX_VIDEO_BYTES = 50 * 1024 * 1024


def _normalize_ct(content_type: str | None) -> str:
    if not content_type:
        return ""
    return content_type.split(";")[0].strip().lower()


def ensure_user_dir(user_id: int) -> Path:
    p = GALLERY_ROOT / str(user_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def add_gallery_item(user_id: int, existing: list[dict], raw: bytes, content_type: str | None) -> dict:
    ct = _normalize_ct(content_type)
    is_video = ct in VIDEO_MIMES
    if is_video:
        ext = VIDEO_MIMES.get(ct)
        max_b = MAX_VIDEO_BYTES
    else:
        ext = IMAGE_MIMES.get(ct)
        max_b = MAX_IMAGE_BYTES
    if not ext:
        raise ValueError("unsupported_mime")
    if len(raw) > max_b:
        raise ValueError("too_large")
    if len(raw) < 16:
        raise ValueError("empty_file")

    uid = uuid.uuid4().hex
    folder = ensure_user_dir(user_id)
    fname = f"{uid}{ext}"
    out = folder / fname
    out.write_bytes(raw)
    url = f"{PUBLIC_PREFIX}/{user_id}/{fname}"
    kind = KIND_VIDEO if is_video else KIND_IMAGE
    return {"id": uid, "url": url, "kind": kind}


def delete_gallery_file(user_id: int, media_id: str) -> None:
    """Удаляет файл по id (без расширения в id: ищем по префиксу)."""
    safe = "".join(c for c in media_id if c in "0123456789abcdefABCDEF")
    if len(safe) != len(media_id) or len(safe) < 16:
        return
    folder = GALLERY_ROOT / str(user_id)
    if not folder.is_dir():
        return
    for p in folder.glob(f"{safe}.*"):
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass


def delete_user_gallery_folder(user_id: int) -> None:
    folder = GALLERY_ROOT / str(user_id)
    if not folder.is_dir():
        return
    for p in folder.iterdir():
        try:
            if p.is_file():
                p.unlink(missing_ok=True)
        except OSError:
            pass
    try:
        folder.rmdir()
    except OSError:
        pass
