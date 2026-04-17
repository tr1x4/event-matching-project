"""Файлы медиа событий: до 10 файлов; фото и видео до 50 МБ каждый."""

from __future__ import annotations

import uuid
import shutil
from pathlib import Path

from app.storage_paths import event_media_storage_dir

EVENT_MEDIA_ROOT: Path = event_media_storage_dir()
PUBLIC_PREFIX = "/media/events"

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
MAX_FILES = 10


def _normalize_ct(content_type: str | None) -> str:
    if not content_type:
        return ""
    return content_type.split(";")[0].strip().lower()


def append_event_media(event_id: int, existing: list[dict], raw: bytes, content_type: str | None) -> dict:
    if len(existing) >= MAX_FILES:
        raise ValueError("too_many_files")
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

    idx = len(existing)
    folder = EVENT_MEDIA_ROOT / str(event_id)
    folder.mkdir(parents=True, exist_ok=True)
    fname = f"{idx}{ext}"
    out = folder / fname
    out.write_bytes(raw)
    url = f"{PUBLIC_PREFIX}/{event_id}/{fname}"
    kind = KIND_VIDEO if is_video else KIND_IMAGE
    return {"id": str(uuid.uuid4()), "url": url, "kind": kind}


def delete_event_media_directory(event_id: int) -> None:
    p = EVENT_MEDIA_ROOT / str(int(event_id))
    if p.is_dir():
        shutil.rmtree(p, ignore_errors=True)


def delete_event_media_file(url: str) -> None:
    """Удаляет файл с диска, если путь внутри хранилища событий."""
    if not url or not str(url).startswith(PUBLIC_PREFIX + "/"):
        return
    rel = str(url).removeprefix(PUBLIC_PREFIX + "/").lstrip("/")
    if ".." in rel or rel.startswith("/"):
        return
    path = EVENT_MEDIA_ROOT / rel
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        return
