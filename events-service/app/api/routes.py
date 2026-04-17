from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api.deps import get_authorization_header
from app.db.database import SessionLocal
from app.event_categories import EVENT_CATEGORY_SLUGS
from app.models.event import Event
from app.services.event_media_storage import append_event_media, delete_event_media_directory, delete_event_media_file
from app.services.event_time import (
    ALLOWED_BUCKET,
    ALLOWED_DURATION,
    BUCKET_TO_EXPECTED,
    compute_event_status,
    parse_starts_at,
    event_dict_augmented,
)
from app.services.chat_upstream import (
    add_event_chat_member,
    create_event_chat,
    delete_event_chat_for_event,
    get_event_chat_id,
    leave_event_chat_member,
    patch_event_chat_meta,
)
from app.services.match_upstream import notify_match_event_derivatives
from app.services.profiles_upstream import ProfileUpstreamError, fetch_my_profile, parse_detail

router = APIRouter()


def _verify_internal_chat_token(x_service_token: str | None = Header(None, alias="X-Service-Token")) -> None:
    expected = (os.environ.get("INTERNAL_CHAT_TOKEN") or "dev-internal-chat-token").strip()
    if (x_service_token or "").strip() != expected:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Нет доступа")


def raise_from_profile_upstream(e: ProfileUpstreamError) -> None:
    """401/403 от profiles → тот же статус клиенту (SPA делает refresh по 401)."""
    if e.status_code == 404:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=e.message) from e
    if e.status_code == 401:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Нет доступа") from e
    if e.status_code == 403:
        d = parse_detail(e.message) or "Доступ запрещён"
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=d) from e
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Не удалось загрузить профиль. Попробуйте позже.",
    ) from e


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def sort_media_video_first(media: list[dict[str, Any]]) -> list[dict[str, Any]]:
    v = [m for m in media if m.get("kind") == "video"]
    o = [m for m in media if m.get("kind") != "video"]
    return v + o


def _event_base_dict(event: Event) -> dict[str, Any]:
    tags = json.loads(event.tags or "[]")
    participants = json.loads(event.participants or "[]")
    media = json.loads(event.media or "[]")
    if not isinstance(media, list):
        media = []
    blocked = _blocked_ids(event)
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description or "",
        "latitude": event.latitude,
        "longitude": event.longitude,
        "creator_profile_id": event.creator_profile_id,
        "expected_participants": event.expected_participants,
        "category_interest_slug": event.category_interest_slug,
        "category_slugs": _category_slugs_list(event),
        "tags": tags if isinstance(tags, list) else [],
        "participants": participants if isinstance(participants, list) else [],
        "blocked_profile_ids": blocked,
        "media": sort_media_video_first([m for m in media if isinstance(m, dict)]),
    }


def _event_to_dict(event: Event) -> dict[str, Any]:
    return event_dict_augmented(event, _event_base_dict(event))


def _event_to_dict_with_chat(event: Event) -> dict[str, Any]:
    d = _event_to_dict(event)
    d["event_chat_id"] = get_event_chat_id(event.id)
    return d


def _ensure_event_chat_exists(event: Event) -> None:
    """Создаёт чат в chats-service, если его ещё нет (восстановление после сбоя или неверного URL)."""
    eid = int(event.id)
    if get_event_chat_id(eid) is not None:
        return
    title = str(event.title or "").strip()
    desc = (event.description or "").strip()
    owner = int(event.creator_profile_id)
    for attempt in range(3):
        create_event_chat(eid, title, desc, owner, "")
        time.sleep(0.08 * (attempt + 1))
        if get_event_chat_id(eid) is not None:
            return


def _participant_ids(event: Event) -> list[int]:
    raw = json.loads(event.participants or "[]")
    if not isinstance(raw, list):
        return []
    out: list[int] = []
    for x in raw:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            continue
    return out


def _event_member_ids_set(event: Event) -> set[int]:
    s = {int(event.creator_profile_id)}
    s.update(_participant_ids(event))
    return s


def _blocked_ids(event: Event) -> list[int]:
    raw = json.loads(getattr(event, "blocked_from_rejoin", None) or "[]")
    if not isinstance(raw, list):
        return []
    out: list[int] = []
    for x in raw:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            continue
    return out


def _set_blocked_ids(event: Event, ids: list[int]) -> None:
    event.blocked_from_rejoin = json.dumps(ids)


def _category_slugs_list(event: Event) -> list[str]:
    raw = getattr(event, "category_slugs_json", None) or "[]"
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        data = []
    if not isinstance(data, list):
        return []
    out: list[str] = []
    for x in data:
        s = str(x).strip()
        if s and s not in out:
            out.append(s)
    if not out and getattr(event, "category_interest_slug", None):
        s0 = str(event.category_interest_slug).strip()
        if s0:
            return [s0]
    return out


class EventCreateBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=8000)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    category_slugs: list[str] = Field(..., min_length=1, max_length=12)
    starts_at: str = Field(..., min_length=8, max_length=48)
    duration_key: str = Field(..., min_length=2, max_length=16)
    participant_bucket: str = Field(..., min_length=2, max_length=16)

    @field_validator("category_slugs", mode="before")
    @classmethod
    def _cats_before(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            s = v.strip()
            return [s] if s else []
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if str(x).strip()]

    @field_validator("category_slugs")
    @classmethod
    def _cats(cls, v: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for s in v:
            if s in seen:
                continue
            if s not in EVENT_CATEGORY_SLUGS:
                raise ValueError("category_slugs")
            seen.add(s)
            out.append(s)
        if not out:
            raise ValueError("category_slugs")
        return out

    @field_validator("duration_key")
    @classmethod
    def _dur(cls, v: str) -> str:
        s = v.strip()
        if s not in ALLOWED_DURATION:
            raise ValueError("duration_key")
        return s

    @field_validator("participant_bucket")
    @classmethod
    def _bucket(cls, v: str) -> str:
        s = v.strip()
        if s not in ALLOWED_BUCKET:
            raise ValueError("participant_bucket")
        return s


class EventPatchBody(BaseModel):
    description: str | None = Field(None, max_length=8000)
    hidden_from_discovery: bool | None = None
    participant_bucket: str | None = Field(None, description="p2 | p3_4 | p5_9 | p10_plus")


class EventMediaDeleteBody(BaseModel):
    media_id: str = Field(..., min_length=4, max_length=80)


@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(
    body: EventCreateBody,
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
):
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    if not profile.get("is_complete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Заполните профиль полностью, чтобы создавать события.",
        )

    cats = body.category_slugs
    slug = cats[0]

    st = parse_starts_at(body.starts_at.strip())
    if st is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректная дата и время начала события.",
        )
    if st <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Дата и время начала должны быть в будущем.",
        )

    dk = body.duration_key
    bk = body.participant_bucket

    profile_id = int(profile["id"])
    tags = list(cats)
    participants = [profile_id]
    exp_n = BUCKET_TO_EXPECTED[bk]

    event = Event(
        title=body.title.strip(),
        description=(body.description or "").strip(),
        latitude=body.latitude,
        longitude=body.longitude,
        creator_profile_id=profile_id,
        expected_participants=int(exp_n),
        category_interest_slug=slug,
        category_slugs_json=json.dumps(cats),
        tags=json.dumps(tags),
        participants=json.dumps(participants),
        media=json.dumps([]),
        starts_at=st.isoformat().replace("+00:00", "Z"),
        duration_key=dk,
        participant_bucket=bk,
        completed_flag=0,
        hidden_from_discovery=0,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    _ensure_event_chat_exists(event)
    notify_match_event_derivatives(event.id)
    return _event_to_dict_with_chat(event)


@router.patch("/events/{event_id}")
def patch_my_event(
    event_id: int,
    body: EventPatchBody,
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
):
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
    if int(event.creator_profile_id) != int(profile["id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Редактировать может только автор")

    if int(event.completed_flag or 0):
        if body.description is not None or body.hidden_from_discovery is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="У завершённого события можно изменить только ожидаемое число участников (диапазон).",
            )
        if body.participant_bucket is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Передайте participant_bucket (p2, p3_4, p5_9 или p10_plus).",
            )
        pb = body.participant_bucket.strip()
        if pb not in ALLOWED_BUCKET:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Некорректный participant_bucket")
        event.participant_bucket = pb
        event.expected_participants = int(BUCKET_TO_EXPECTED[pb])
        db.commit()
        db.refresh(event)
        return _event_to_dict(event)

    if body.description is not None:
        event.description = body.description.strip()
    if body.hidden_from_discovery is not None:
        event.hidden_from_discovery = 1 if body.hidden_from_discovery else 0
    if body.participant_bucket is not None:
        pb = body.participant_bucket.strip()
        if pb not in ALLOWED_BUCKET:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Некорректный participant_bucket")
        event.participant_bucket = pb
        event.expected_participants = int(BUCKET_TO_EXPECTED[pb])

    db.commit()
    db.refresh(event)
    return _event_to_dict(event)


@router.post("/events/{event_id}/complete")
def mark_event_completed(
    event_id: int,
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
):
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
    if int(event.creator_profile_id) != int(profile["id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Завершить может только автор")

    event.completed_flag = 1
    db.commit()
    db.refresh(event)
    return _event_to_dict(event)


@router.delete("/events/{event_id}")
def delete_my_completed_event(
    event_id: int,
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
):
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
    if int(event.creator_profile_id) != int(profile["id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Удалить может только автор")
    if not int(event.completed_flag or 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Полностью удалить можно только завершённое событие",
        )

    delete_event_media_directory(event_id)
    delete_event_chat_for_event(event_id)
    db.delete(event)
    db.commit()
    notify_match_event_derivatives(event_id)
    return {"ok": True}


@router.post("/events/{event_id}/event-chat/ensure")
def ensure_event_chat(
    event_id: int,
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
):
    """Создать чат события, если он отсутствует (организатор или участник)."""
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Событие не найдено")

    pid = int(profile["id"])
    parts = _participant_ids(event)
    if int(event.creator_profile_id) != pid and pid not in parts:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только участники события могут открыть чат.",
        )

    _ensure_event_chat_exists(event)
    cid = get_event_chat_id(event_id)
    if cid is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Чат временно недоступен. Попробуйте позже.",
        )
    # Все участники события должны быть в chat_members (рассинхрон после сбоя или старых данных).
    for mid in sorted(_event_member_ids_set(event)):
        add_event_chat_member(int(event_id), int(mid))
    return {"chat_id": int(cid)}


@router.post("/events/{event_id}/join")
def join_event(
    event_id: int,
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
):
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    if not profile.get("is_complete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Заполните профиль, чтобы присоединяться к событиям.",
        )

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Событие не найдено")

    pid = int(profile["id"])
    if int(event.creator_profile_id) == pid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Вы организатор этого события")

    if int(event.hidden_from_discovery or 0):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="К этому событию нельзя присоединиться")

    st = getattr(event, "starts_at", None) or ""
    dk = getattr(event, "duration_key", None) or "d1"
    done = bool(getattr(event, "completed_flag", 0))
    st_code = compute_event_status(str(st) if st else None, str(dk) if dk else None, done)
    if st_code == "completed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Событие уже завершено")

    parts = _participant_ids(event)
    if pid in parts:
        return _event_to_dict_with_chat(event)

    if pid in _blocked_ids(event):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Организатор исключил вас из этого события. Повторное участие возможно только после снятия ограничения.",
        )

    raw = json.loads(event.participants or "[]")
    if not isinstance(raw, list):
        raw = []
    raw.append(pid)
    event.participants = json.dumps(raw)
    db.commit()
    db.refresh(event)
    _ensure_event_chat_exists(event)
    add_event_chat_member(event_id, pid)
    return _event_to_dict_with_chat(event)


@router.post("/events/{event_id}/leave")
def leave_event(
    event_id: int,
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
):
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    if not profile.get("is_complete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Заполните профиль, чтобы управлять участием в событиях.",
        )

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Событие не найдено")

    pid = int(profile["id"])
    if int(event.creator_profile_id) == pid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Организатор не может покинуть событие через этот пункт")

    st = getattr(event, "starts_at", None) or ""
    dk = getattr(event, "duration_key", None) or "d1"
    done = bool(getattr(event, "completed_flag", 0))
    st_code = compute_event_status(str(st) if st else None, str(dk) if dk else None, done)
    if st_code == "completed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Событие уже завершено")

    parts = _participant_ids(event)
    if pid not in parts:
        return _event_to_dict(event)

    new_parts = [x for x in parts if x != pid]
    event.participants = json.dumps(new_parts)
    db.commit()
    db.refresh(event)
    leave_event_chat_member(event_id, pid)
    notify_match_event_derivatives(event_id)
    return _event_to_dict(event)


@router.post("/events/{event_id}/participants/{profile_id}/remove")
def remove_event_participant(
    event_id: int,
    profile_id: int,
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
):
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
    owner = int(profile["id"])
    if int(event.creator_profile_id) != owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Только автор может исключать участников")
    if profile_id == int(event.creator_profile_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Нельзя исключить организатора")

    parts = _participant_ids(event)
    if profile_id not in parts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Участник не в списке")

    new_parts = [x for x in parts if x != profile_id]
    event.participants = json.dumps(new_parts)
    blocked = list(dict.fromkeys(_blocked_ids(event) + [profile_id]))
    _set_blocked_ids(event, blocked)
    db.commit()
    db.refresh(event)
    leave_event_chat_member(event_id, profile_id)
    notify_match_event_derivatives(event_id)
    return _event_to_dict(event)


@router.post("/events/{event_id}/participants/{profile_id}/unblock")
def unblock_event_participant(
    event_id: int,
    profile_id: int,
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
):
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
    if int(event.creator_profile_id) != int(profile["id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Только автор может снимать ограничение")

    blocked = [x for x in _blocked_ids(event) if x != profile_id]
    _set_blocked_ids(event, blocked)

    # Снова в списке участников: в blocked попадают только после исключения автором (не после «Покинуть»)
    creator_id = int(event.creator_profile_id)
    if profile_id != creator_id:
        parts = _participant_ids(event)
        if profile_id not in parts:
            raw = json.loads(event.participants or "[]")
            if not isinstance(raw, list):
                raw = []
            raw.append(profile_id)
            event.participants = json.dumps(raw)
            _ensure_event_chat_exists(event)
            add_event_chat_member(event_id, profile_id)

    db.commit()
    db.refresh(event)
    notify_match_event_derivatives(event_id)
    return _event_to_dict(event)


@router.get("/events/mine")
def list_my_events(
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
):
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    pid = int(profile["id"])
    events = db.query(Event).order_by(Event.id.desc()).all()
    out: list[dict[str, Any]] = []
    for e in events:
        parts = _participant_ids(e)
        if int(e.creator_profile_id) == pid or pid in parts:
            out.append(_event_to_dict(e))
    return out


@router.post("/events/{event_id}/media")
async def upload_event_media(
    event_id: int,
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
    if int(event.creator_profile_id) != int(profile["id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Только автор может добавлять медиа")
    if int(event.completed_flag or 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Завершённое событие нельзя изменять",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Файл пустой")

    try:
        existing = json.loads(event.media or "[]")
        if not isinstance(existing, list):
            existing = []
        item = append_event_media(event_id, existing, raw, file.content_type)
        existing.append(item)
        event.media = json.dumps(existing)
        db.commit()
        db.refresh(event)
        media_list = json.loads(event.media or "[]")
        first_img: str | None = None
        if isinstance(media_list, list):
            for m in media_list:
                if isinstance(m, dict) and m.get("kind") == "image":
                    u = str(m.get("url") or "").strip()
                    if u:
                        first_img = u
                        break
        if first_img:
            patch_event_chat_meta(event_id, avatar_url=first_img)
    except ValueError as exc:
        code = str(exc)
        if code == "too_many_files":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Не более 10 файлов медиа на одно событие",
            ) from exc
        if code == "unsupported_mime":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Допустимы изображения (JPEG, PNG, WebP, GIF) и видео MP4 или WebM",
            ) from exc
        if code == "too_large":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Файл слишком большой",
            ) from exc
        if code == "empty_file":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Файл повреждён или слишком маленький",
            ) from exc
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Не удалось сохранить файл") from exc

    return _event_to_dict(event)


@router.post("/events/{event_id}/media/delete")
def delete_event_media_item(
    event_id: int,
    body: EventMediaDeleteBody,
    authorization: str = Depends(get_authorization_header),
    db: Session = Depends(get_db),
):
    try:
        profile = fetch_my_profile(authorization)
    except ProfileUpstreamError as e:
        raise_from_profile_upstream(e)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
    if int(event.creator_profile_id) != int(profile["id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Только автор может удалять медиа")
    if int(event.completed_flag or 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Завершённое событие нельзя изменять",
        )

    try:
        existing = json.loads(event.media or "[]")
        if not isinstance(existing, list):
            existing = []
    except (json.JSONDecodeError, TypeError):
        existing = []

    mid = body.media_id.strip()
    found: dict[str, Any] | None = None
    rest: list[dict[str, Any]] = []
    for m in existing:
        if not isinstance(m, dict):
            continue
        if str(m.get("id") or "") == mid:
            found = m
            continue
        rest.append(m)
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Файл не найден")

    url = str(found.get("url") or "")
    delete_event_media_file(url)
    event.media = json.dumps(rest)
    db.commit()
    db.refresh(event)
    return _event_to_dict(event)


@router.get("/internal/common-events-between", dependencies=[Depends(_verify_internal_chat_token)])
def internal_common_events_between(profile_a: int, profile_b: int, db: Session = Depends(get_db)):
    pa, pb = int(profile_a), int(profile_b)
    if pa == pb:
        return {"shared": False}
    for ev in db.query(Event).all():
        mem = _event_member_ids_set(ev)
        if pa in mem and pb in mem:
            return {"shared": True}
    return {"shared": False}


@router.get("/events")
def list_events(db: Session = Depends(get_db)):
    events = db.query(Event).order_by(Event.id.desc()).all()
    return [_event_to_dict(e) for e in events]


@router.get("/events/{event_id}")
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        return {"error": "not found"}
    return _event_to_dict_with_chat(event)
