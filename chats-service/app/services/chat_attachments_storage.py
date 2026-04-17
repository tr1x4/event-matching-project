"""Файлы вложений и голосовые сообщения чата."""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from app.core.config import settings

PUBLIC_PREFIX = "/media/chat-files"

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
AUDIO_MIMES = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/webm": ".webm",
    "audio/mp4": ".m4a",
}

_MB = 1024 * 1024
_GB = 1024 * 1024 * 1024
MAX_IMAGE = 50 * _MB
MAX_VIDEO = 2 * _GB
MAX_AUDIO = 50 * _MB
MAX_FILE = 2 * _GB
MAX_VOICE = 50 * _MB


def chat_files_root() -> Path:
    base = Path(settings.storage_path or "/data")
    root = base / "chat-files"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _norm_ct(content_type: str | None) -> str:
    if not content_type:
        return ""
    return content_type.split(";")[0].strip().lower()


def save_chat_upload(chat_id: int, raw: bytes, content_type: str | None, original_name: str | None) -> dict:
    """Сохраняет файл, возвращает объект вложения для attachments_json."""
    if len(raw) < 16:
        raise ValueError("empty_file")
    ct = _norm_ct(content_type)
    uid = uuid.uuid4().hex
    folder = chat_files_root() / str(int(chat_id))
    folder.mkdir(parents=True, exist_ok=True)

    if ct in VIDEO_MIMES:
        ext = VIDEO_MIMES[ct]
        if len(raw) > MAX_VIDEO:
            raise ValueError("too_large")
        kind = "video"
        max_b = MAX_VIDEO
    elif ct in IMAGE_MIMES:
        ext = IMAGE_MIMES[ct]
        if len(raw) > MAX_IMAGE:
            raise ValueError("too_large")
        kind = "image"
        max_b = MAX_IMAGE
    elif ct in AUDIO_MIMES:
        ext = AUDIO_MIMES[ct]
        if len(raw) > MAX_AUDIO:
            raise ValueError("too_large")
        kind = "audio"
        max_b = MAX_AUDIO
    else:
        ext = ".bin"
        if ct == "application/pdf":
            ext = ".pdf"
        elif ct == "application/zip":
            ext = ".zip"
        elif ct == "text/plain":
            ext = ".txt"
        if len(raw) > MAX_FILE:
            raise ValueError("too_large")
        kind = "file"
        max_b = MAX_FILE

    if len(raw) > max_b:
        raise ValueError("too_large")

    fname = f"{uid}{ext}"
    out = folder / fname
    out.write_bytes(raw)
    url = f"{PUBLIC_PREFIX}/{int(chat_id)}/{fname}"
    name = (original_name or fname).strip()[:240] or fname
    return {"url": url, "name": name, "mime": ct or "application/octet-stream", "kind": kind}


def save_voice_message(chat_id: int, raw: bytes, content_type: str | None) -> str:
    """Относительный путь для поля voice_path (тот же префикс, что и у вложений)."""
    if len(raw) < 32:
        raise ValueError("empty_file")
    if len(raw) > MAX_VOICE:
        raise ValueError("too_large")
    ct = _norm_ct(content_type)
    ext = ".webm"
    if "mpeg" in ct or ct == "audio/mp3":
        ext = ".mp3"
    elif ct == "audio/wav":
        ext = ".wav"
    elif ct == "audio/ogg":
        ext = ".ogg"
    uid = uuid.uuid4().hex
    folder = chat_files_root() / str(int(chat_id)) / "voice"
    folder.mkdir(parents=True, exist_ok=True)
    fname = f"{uid}{ext}"
    out = folder / fname
    out.write_bytes(raw)
    return f"{PUBLIC_PREFIX}/{int(chat_id)}/voice/{fname}"
