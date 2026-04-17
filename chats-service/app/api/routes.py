from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import decode_user_id
from app.db.database import SessionLocal
from app.models.chat import Chat, ChatMember, Message
from app.services.upstream import (
    event_profile_access,
    fetch_event_public,
    fetch_my_profile,
    fetch_profile_internal,
    have_common_events,
)
from app.services.chat_attachments_storage import save_chat_upload, save_voice_message
from app.ws.hub import hub
from app.ws.inbox_hub import inbox_hub

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _internal_token(x_service_token: str | None = Header(None, alias="X-Service-Token")) -> None:
    from app.core.config import settings

    if (x_service_token or "").strip() != settings.internal_token.strip():
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Нет доступа")


def _auth_profile(authorization: str | None = Header(None)) -> tuple[int, str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Требуется авторизация")
    token = authorization.split(" ", 1)[1].strip()
    if decode_user_id(token) is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
    pr = fetch_my_profile(authorization.strip())
    if not pr or not pr.get("id"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Профиль недоступен")
    return int(pr["id"]), authorization.strip()


def _member(db: Session, chat_id: int, profile_id: int) -> ChatMember | None:
    return (
        db.query(ChatMember)
        .filter(ChatMember.chat_id == chat_id, ChatMember.profile_id == profile_id)
        .first()
    )


def _ensure_active_member(db: Session, chat: Chat, profile_id: int) -> ChatMember:
    m = _member(db, chat.id, profile_id)
    if not m or m.left_at is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Вы не в этом чате")
    return m


def _attachment_is_media_strip(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    k = str(item.get("kind") or "").lower()
    if k in ("image", "video"):
        return True
    m = str(item.get("mime") or "").lower()
    return m.startswith("image/") or m.startswith("video/")


def _partition_media_and_files(att: list[Any]) -> tuple[list[Any], list[Any]]:
    media: list[Any] = []
    files: list[Any] = []
    for a in att:
        if _attachment_is_media_strip(a):
            media.append(a)
        else:
            files.append(a)
    return media, files


def _build_send_message_plans(text: str, voice: str | None, att: list[Any]) -> list[tuple[str | None, str | None, list[Any]]]:
    """Одно или два сообщения: лента фото/видео отдельно от остальных файлов."""
    t = (text or "").strip() or None
    if voice:
        return [(None, voice, [])]
    media, files = _partition_media_and_files(att)
    if media and files:
        return [(t, None, media), (None, None, files)]
    return [(t, None, att)]


def _expand_plans_chunk_attachments(plans: list[tuple[str | None, str | None, list[Any]]]) -> list[tuple[str | None, str | None, list[Any]]]:
    """Не более 10 вложений на сообщение: длинные списки режутся на несколько сообщений."""
    out: list[tuple[str | None, str | None, list[Any]]] = []
    for b, v, aplan in plans:
        if v:
            out.append((b, v, list(aplan)))
            continue
        aplan = list(aplan)
        if len(aplan) <= 10:
            out.append((b, None, aplan))
            continue
        for i in range(0, len(aplan), 10):
            chunk = aplan[i : i + 10]
            out.append((b if i == 0 else None, None, chunk))
    return out


async def _persist_chat_message(
    db: Session,
    chat_id: int,
    pid: int,
    body: str | None,
    voice: str | None,
    att: list[Any],
    reply_to_message_id: int | None = None,
) -> dict[str, Any]:
    msg = Message(
        chat_id=chat_id,
        sender_profile_id=pid,
        is_system=0,
        body=body,
        voice_path=voice,
        attachments_json=json.dumps(att if isinstance(att, list) else [], ensure_ascii=False),
        reply_to_message_id=reply_to_message_id,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    d = _msg_to_dict(db, msg)
    await hub.broadcast(chat_id, {"type": "message", "message": d})
    return d


async def _persist_system_message(db: Session, chat_id: int, actor_pid: int, body: str) -> dict[str, Any]:
    msg = Message(
        chat_id=chat_id,
        sender_profile_id=int(actor_pid),
        is_system=1,
        body=body,
        voice_path=None,
        attachments_json="[]",
        reply_to_message_id=None,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    d = _msg_to_dict(db, msg)
    await hub.broadcast(chat_id, {"type": "message", "message": d})
    return d


async def _notify_inbox_new_message(db: Session, ch: Chat, sender_id: int, last_msg: dict[str, Any]) -> None:
    rows = (
        db.query(ChatMember.profile_id, ChatMember.notify_muted)
        .filter(ChatMember.chat_id == ch.id, ChatMember.left_at.is_(None))
        .all()
    )
    targets: list[int] = []
    for profile_id, notify_muted in rows:
        if int(profile_id) == int(sender_id):
            continue
        if int(notify_muted or 0):
            continue
        targets.append(int(profile_id))
    if not targets:
        return
    if last_msg.get("is_system"):
        return
    preview = (last_msg.get("body") or "").strip()[:180]
    if not preview:
        preview = "🎤 Голосовое" if last_msg.get("voice_path") else "Файл"
    await inbox_hub.broadcast_users(
        targets,
        {
            "type": "inbox_message",
            "chat_id": ch.id,
            "chat_kind": ch.kind,
            "message": last_msg,
            "preview": preview[:200],
            "sender_profile_id": sender_id,
        },
    )


def _reply_snippet_from_message(ref: Message) -> str:
    if ref.deleted_globally:
        return "Сообщение удалено"
    body = (ref.body or "").strip()
    if body:
        return body[:200] + ("…" if len(body) > 200 else "")
    if ref.voice_path:
        return "Голосовое сообщение"
    try:
        att = json.loads(ref.attachments_json or "[]")
    except json.JSONDecodeError:
        att = []
    if isinstance(att, list) and att:
        first = att[0]
        if isinstance(first, dict):
            name = str(first.get("name") or "").strip()
            if name:
                return name[:200]
        return "Вложение"
    return ""


def _msg_to_dict(db: Session, m: Message) -> dict[str, Any]:
    try:
        att = json.loads(m.attachments_json or "[]")
    except json.JSONDecodeError:
        att = []
    rid = m.reply_to_message_id
    reply_preview: dict[str, Any] | None = None
    if rid:
        ref = db.query(Message).filter(Message.id == int(rid), Message.chat_id == m.chat_id).first()
        if ref:
            snippet = _reply_snippet_from_message(ref)
            reply_preview = {
                "id": ref.id,
                "sender_profile_id": ref.sender_profile_id,
                "snippet": snippet or "Сообщение",
                "has_voice": bool(ref.voice_path and not ref.deleted_globally),
                "has_attachments": _attachment_list_nonempty(ref) if not ref.deleted_globally else False,
            }
        else:
            reply_preview = {
                "id": int(rid),
                "sender_profile_id": 0,
                "snippet": "Сообщение недоступно",
                "has_voice": False,
                "has_attachments": False,
            }
    return {
        "id": m.id,
        "chat_id": m.chat_id,
        "sender_profile_id": m.sender_profile_id,
        "is_system": bool(getattr(m, "is_system", 0) or 0),
        "body": m.body,
        "voice_path": m.voice_path,
        "attachments": att if isinstance(att, list) else [],
        "reply_to_message_id": int(rid) if rid is not None else None,
        "reply_preview": reply_preview,
        "edited_at": m.edited_at.isoformat() if m.edited_at else None,
        "edited": bool(m.edited_at),
        "deleted_globally": bool(m.deleted_globally),
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _attachment_list_nonempty(ref: Message) -> bool:
    try:
        a = json.loads(ref.attachments_json or "[]")
    except json.JSONDecodeError:
        return False
    return isinstance(a, list) and len(a) > 0


def _blocked_ids(ev: dict) -> set[int]:
    raw = ev.get("blocked_profile_ids") or []
    if not isinstance(raw, list):
        return set()
    out: set[int] = set()
    for x in raw:
        try:
            out.add(int(x))
        except (TypeError, ValueError):
            continue
    return out


def _can_read_event_chat(ch: Chat, profile_id: int, member_row: ChatMember | None, ev: dict | None) -> tuple[bool, str | None]:
    """Активный участник или бывший участник (покинул — только история), но не из блок-листа."""
    if not ev:
        return False, "Событие не найдено"
    ok, err = event_profile_access(profile_id, ev)
    if ok:
        return True, None
    if profile_id in _blocked_ids(ev):
        return False, err or "Вы заблокированы в этом событии"
    if member_row and member_row.left_at is not None:
        return True, None
    return False, err or "Нет доступа к чату"


def _dm_peer_tuple(a: int, b: int) -> tuple[int, int]:
    x, y = sorted((int(a), int(b)))
    return x, y


def _parse_dm_block_ids(raw: Any) -> set[int]:
    if not isinstance(raw, list):
        return set()
    out: set[int] = set()
    for x in raw:
        try:
            out.add(int(x))
        except (TypeError, ValueError):
            continue
    return out


def _dm_mutually_blocked(prof_me: dict, prof_peer: dict, my_id: int, peer_id: int) -> bool:
    mine = _parse_dm_block_ids(prof_me.get("dm_blocked_profile_ids"))
    theirs = _parse_dm_block_ids(prof_peer.get("dm_blocked_profile_ids"))
    return peer_id in mine or my_id in theirs


def _find_dm_chat(db: Session, a: int, b: int) -> Chat | None:
    x, y = _dm_peer_tuple(a, b)
    return (
        db.query(Chat)
        .filter(
            Chat.kind == "dm",
            Chat.dm_peer_a == x,
            Chat.dm_peer_b == y,
            Chat.deleted_globally_at.is_(None),
        )
        .first()
    )


def _can_initiate_dm(
    sender_id: int,
    target_id: int,
    prof_sender: dict,
    prof_target: dict,
    chat_exists: bool,
) -> tuple[bool, str | None]:
    if chat_exists:
        return True, None
    priv = str(prof_target.get("dm_privacy") or "all").strip()
    if priv not in ("all", "acquaintances", "nobody"):
        priv = "all"
    if priv == "all":
        return True, None
    if priv == "nobody":
        return False, "Этот пользователь принимает личные сообщения только от тех, с кем переписка уже начата."
    if priv == "acquaintances":
        if have_common_events(sender_id, target_id):
            return True, None
        return False, "Этот пользователь принимает сообщения только от знакомых (есть общие события)."
    return True, None


class InternalEventChatBody(BaseModel):
    event_id: int
    title: str
    description: str = ""
    owner_profile_id: int
    avatar_url: str = ""


def _profile_display_name(profile_id: int) -> str:
    p = fetch_profile_internal(int(profile_id))
    if not p:
        return f"Участник #{int(profile_id)}"
    return (str(p.get("name") or "").strip() or f"Участник #{int(profile_id)}")


@router.post("/internal/event-chats", dependencies=[Depends(_internal_token)])
async def internal_create_event_chat(body: InternalEventChatBody, db: Session = Depends(get_db)):
    ex = db.query(Chat).filter(Chat.event_id == body.event_id).first()
    if ex:
        return {"chat_id": ex.id, "created": False}
    ch = Chat(
        kind="event",
        event_id=body.event_id,
        title=(body.title or "")[:300],
        subtitle=(body.description or "")[:8000],
        avatar_url=(body.avatar_url or "")[:512],
        owner_profile_id=body.owner_profile_id,
    )
    db.add(ch)
    db.flush()
    db.add(
        ChatMember(
            chat_id=ch.id,
            profile_id=body.owner_profile_id,
            role="owner",
        )
    )
    db.commit()
    db.refresh(ch)
    nm = _profile_display_name(int(body.owner_profile_id))
    await _persist_system_message(db, int(ch.id), int(body.owner_profile_id), f"{nm} создал(а) это событие.")
    return {"chat_id": ch.id, "created": True}


class InternalMemberBody(BaseModel):
    profile_id: int


@router.post("/internal/event-chats/{event_id}/members", dependencies=[Depends(_internal_token)])
async def internal_add_event_member(event_id: int, body: InternalMemberBody, db: Session = Depends(get_db)):
    ch = db.query(Chat).filter(Chat.event_id == event_id, Chat.kind == "event").first()
    if not ch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат события не найден")
    m = _member(db, ch.id, body.profile_id)
    if m and m.left_at is None:
        return {"chat_id": ch.id, "ok": True}
    if m and m.left_at is not None:
        m.left_at = None
        m.leave_cutoff_message_id = 0
        db.commit()
        nm = _profile_display_name(int(body.profile_id))
        await _persist_system_message(db, int(ch.id), int(body.profile_id), f"{nm} присоединился к событию.")
        return {"chat_id": ch.id, "ok": True}
    db.add(ChatMember(chat_id=ch.id, profile_id=body.profile_id, role="member"))
    db.commit()
    nm = _profile_display_name(int(body.profile_id))
    await _persist_system_message(db, int(ch.id), int(body.profile_id), f"{nm} присоединился к событию.")
    return {"chat_id": ch.id, "ok": True}


@router.post("/internal/event-chats/{event_id}/members/leave", dependencies=[Depends(_internal_token)])
async def internal_leave_event_member(event_id: int, body: InternalMemberBody, db: Session = Depends(get_db)):
    ch = db.query(Chat).filter(Chat.event_id == event_id, Chat.kind == "event").first()
    if not ch:
        return {"ok": False}
    m = _member(db, ch.id, body.profile_id)
    if not m:
        return {"ok": True}
    nm = _profile_display_name(int(body.profile_id))
    await _persist_system_message(db, int(ch.id), int(body.profile_id), f"{nm} покинул чат.")
    mid = db.query(func.max(Message.id)).filter(Message.chat_id == ch.id).scalar() or 0
    m.left_at = datetime.now(timezone.utc)
    m.leave_cutoff_message_id = int(mid)
    db.commit()
    return {"ok": True}


@router.get("/internal/event-chats/{event_id}/id", dependencies=[Depends(_internal_token)])
def internal_event_chat_id(event_id: int, db: Session = Depends(get_db)):
    ch = db.query(Chat).filter(Chat.event_id == event_id, Chat.kind == "event").first()
    if not ch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    return {"chat_id": ch.id}


class InternalPatchEventChatBody(BaseModel):
    avatar_url: str | None = None
    title: str | None = None
    subtitle: str | None = None


@router.patch("/internal/event-chats/{event_id}", dependencies=[Depends(_internal_token)])
def internal_patch_event_chat(event_id: int, body: InternalPatchEventChatBody, db: Session = Depends(get_db)):
    ch = db.query(Chat).filter(Chat.event_id == event_id, Chat.kind == "event").first()
    if not ch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат события не найден")
    if body.avatar_url is not None:
        ch.avatar_url = str(body.avatar_url)[:512]
    if body.title is not None:
        ch.title = str(body.title)[:300]
    if body.subtitle is not None:
        ch.subtitle = str(body.subtitle)[:8000]
    db.commit()
    return {"ok": True}


@router.post("/internal/event-chats/{event_id}/soft-delete", dependencies=[Depends(_internal_token)])
async def internal_soft_delete_event_chat(event_id: int, db: Session = Depends(get_db)):
    """Вызывается из events-service при полном удалении завершённого события."""
    ch = db.query(Chat).filter(Chat.event_id == int(event_id), Chat.kind == "event").first()
    if not ch or ch.deleted_globally_at is not None:
        return {"ok": True}
    ch.deleted_globally_at = datetime.now(timezone.utc)
    db.commit()
    await hub.broadcast(ch.id, {"type": "chat_deleted", "chat_id": ch.id})
    return {"ok": True}


@router.get("/chats/dm/eligibility/{peer_profile_id}")
def dm_eligibility(peer_profile_id: int, db: Session = Depends(get_db), auth: tuple[int, str] = Depends(_auth_profile)):
    pid, _ = auth
    tid = int(peer_profile_id)
    if tid == pid:
        return {
            "can_message": False,
            "reason": "self",
            "i_blocked_them": False,
            "they_blocked_me": False,
            "chat_exists": False,
            "chat_id": None,
        }
    prof_me = fetch_profile_internal(pid)
    prof_peer = fetch_profile_internal(tid)
    if not prof_me or not prof_peer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Профиль не найден")
    ch = _find_dm_chat(db, pid, tid)
    exists = ch is not None
    ok, reason = _can_initiate_dm(pid, tid, prof_me, prof_peer, exists)
    blocked = _dm_mutually_blocked(prof_me, prof_peer, pid, tid)
    i_blocked = tid in _parse_dm_block_ids(prof_me.get("dm_blocked_profile_ids"))
    they_blocked = pid in _parse_dm_block_ids(prof_peer.get("dm_blocked_profile_ids"))
    can = bool((exists or ok) and not blocked)
    return {
        "can_message": can,
        "reason": None if can else ("blocked" if blocked else reason),
        "i_blocked_them": i_blocked,
        "they_blocked_me": they_blocked,
        "chat_exists": exists,
        "chat_id": ch.id if ch else None,
    }


@router.post("/chats/dm/open/{peer_profile_id}")
def dm_open(peer_profile_id: int, db: Session = Depends(get_db), auth: tuple[int, str] = Depends(_auth_profile)):
    """Только существующий чат: пустой DM не создаётся до первого сообщения."""
    pid, _ = auth
    tid = int(peer_profile_id)
    if tid == pid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Нельзя открыть чат с собой")
    prof_me = fetch_profile_internal(pid)
    prof_peer = fetch_profile_internal(tid)
    if not prof_me or not prof_peer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Профиль не найден")
    if _dm_mutually_blocked(prof_me, prof_peer, pid, tid):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Отправка недоступна")
    existing = _find_dm_chat(db, pid, tid)
    if existing:
        return {"chat_id": existing.id, "created": False}
    ok, reason = _can_initiate_dm(pid, tid, prof_me, prof_peer, False)
    if not ok:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=reason or "Нельзя начать переписку")
    return {"chat_id": None, "created": False}


class DmFirstMessageBody(BaseModel):
    peer_profile_id: int = Field(..., ge=1)
    body: str | None = None
    voice_path: str | None = None
    attachments_json: str | None = Field(None, description="JSON-массив вложений")
    reply_to_message_id: int | None = Field(None, ge=1)


@router.post("/chats/dm/first-message")
async def dm_first_message(
    body: DmFirstMessageBody,
    db: Session = Depends(get_db),
    auth: tuple[int, str] = Depends(_auth_profile),
):
    """Создаёт личный чат при первой отправке или пишет в уже существующий."""
    pid, _ = auth
    tid = int(body.peer_profile_id)
    if tid == pid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Нельзя написать самому себе")
    prof_me = fetch_profile_internal(pid)
    prof_peer = fetch_profile_internal(tid)
    if not prof_me or not prof_peer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Профиль не найден")
    if _dm_mutually_blocked(prof_me, prof_peer, pid, tid):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Отправка недоступна")
    ch = _find_dm_chat(db, pid, tid)
    if not ch:
        ok, reason = _can_initiate_dm(pid, tid, prof_me, prof_peer, False)
        if not ok:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=reason or "Нельзя начать переписку")
        x, y = _dm_peer_tuple(pid, tid)
        title = (str(prof_peer.get("name") or "").strip() or f"Профиль #{tid}")[:300]
        avatar = str(prof_peer.get("avatar_url") or "").strip()[:512]
        ch = Chat(
            kind="dm",
            event_id=None,
            dm_peer_a=x,
            dm_peer_b=y,
            title=title,
            subtitle="",
            avatar_url=avatar,
            owner_profile_id=None,
        )
        db.add(ch)
        db.flush()
        db.add(ChatMember(chat_id=ch.id, profile_id=pid, role="member"))
        db.add(ChatMember(chat_id=ch.id, profile_id=tid, role="member"))
        db.commit()
        db.refresh(ch)

    text = (body.body or "").strip()
    voice = (body.voice_path or "").strip() or None
    att_raw = body.attachments_json or "[]"
    try:
        att = json.loads(att_raw)
        if not isinstance(att, list):
            att = []
    except json.JSONDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Некорректные вложения")
    if len(att) > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Не более 100 вложений за одну отправку")
    if voice and text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="У голосового сообщения не должно быть текста")
    if voice and att:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="У голосового сообщения не должно быть вложений")
    if not text and not voice and not att:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Пустое сообщение")

    reply_to_id = body.reply_to_message_id
    if reply_to_id is not None:
        ref = db.query(Message).filter(Message.id == reply_to_id, Message.chat_id == ch.id).first()
        if not ref:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Ответ на несуществующее сообщение")

    plans = _expand_plans_chunk_attachments(_build_send_message_plans(text, voice, att))
    out: list[dict[str, Any]] = []
    for idx, (b, v, aplan) in enumerate(plans):
        if not b and not v and not aplan:
            continue
        rid = reply_to_id if idx == 0 else None
        out.append(await _persist_chat_message(db, int(ch.id), pid, b, v, list(aplan), reply_to_message_id=rid))
    if not out:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Пустое сообщение")
    await _notify_inbox_new_message(db, ch, pid, out[-1])
    return {"chat_id": ch.id, "messages": out}


@router.get("/chats/by-event/{event_id}")
def resolve_chat_by_event(event_id: int, db: Session = Depends(get_db), auth: tuple[int, str] = Depends(_auth_profile)):
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.event_id == event_id, Chat.kind == "event").first()
    if not ch or ch.deleted_globally_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    m = _member(db, ch.id, pid)
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Нет доступа к чату")
    ev = fetch_event_public(event_id)
    ok, err = _can_read_event_chat(ch, pid, m, ev or {})
    if not ok:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=err or "Нет доступа")
    return {"chat_id": ch.id}


def _visible_messages_query(db: Session, chat_id: int, mem: ChatMember):
    q = db.query(Message).filter(Message.chat_id == chat_id, Message.deleted_globally == 0)
    q = q.filter(Message.id > mem.history_after_message_id)
    if mem.left_at is not None and mem.leave_cutoff_message_id:
        q = q.filter(Message.id <= mem.leave_cutoff_message_id)
    return q


def _dm_peer_display_for_viewer(ch: Chat, viewer_pid: int) -> tuple[str, str]:
    """Имя и аватар собеседника в личном чате (для списка и шапки комнаты)."""
    if ch.kind != "dm" or ch.dm_peer_a is None or ch.dm_peer_b is None:
        return ((ch.title or "").strip(), str(ch.avatar_url or "").strip())
    other = int(ch.dm_peer_b) if int(viewer_pid) == int(ch.dm_peer_a) else int(ch.dm_peer_a)
    p = fetch_profile_internal(other)
    if not p:
        return (f"Профиль #{other}", "")
    t = (str(p.get("name") or "").strip() or f"Профиль #{other}")[:300]
    a = str(p.get("avatar_url") or "").strip()[:512]
    return (t, a)


def _message_list_preview(m: Message) -> str:
    t = (m.body or "").strip()
    if t:
        return t[:160] + ("…" if len(t) > 160 else "")
    if m.voice_path:
        return "Голосовое сообщение"
    try:
        att = json.loads(m.attachments_json or "[]")
    except json.JSONDecodeError:
        att = []
    if isinstance(att, list) and att:
        return "Вложение"
    return "Сообщение"


@router.get("/chats/me")
def list_my_chats(db: Session = Depends(get_db), auth: tuple[int, str] = Depends(_auth_profile)):
    pid, _ = auth
    rows = (
        db.query(Chat, ChatMember)
        .join(ChatMember, ChatMember.chat_id == Chat.id)
        .filter(
            ChatMember.profile_id == pid,
            Chat.deleted_globally_at.is_(None),
        )
        .order_by(Chat.id.desc())
        .all()
    )
    out = []
    for ch, mem in rows:
        base_q = _visible_messages_query(db, ch.id, mem)
        last = base_q.order_by(Message.id.desc()).first()
        last_preview = _message_list_preview(last) if last else None
        last_sender = int(last.sender_profile_id) if last else None
        unread = (
            base_q.filter(Message.id > int(mem.last_read_message_id or 0), Message.sender_profile_id != int(pid)).count()
        )
        dm_title, dm_avatar = _dm_peer_display_for_viewer(ch, pid) if ch.kind == "dm" else (ch.title, ch.avatar_url)
        out.append(
            {
                "id": ch.id,
                "kind": ch.kind,
                "event_id": ch.event_id,
                "title": dm_title if ch.kind == "dm" else ch.title,
                "subtitle": ch.subtitle[:200] + ("…" if len(ch.subtitle) > 200 else ""),
                "avatar_url": dm_avatar if ch.kind == "dm" else ch.avatar_url,
                "read_only": mem.left_at is not None,
                "last_preview": last_preview,
                "last_sender_profile_id": last_sender,
                "unread_count": int(unread),
            }
        )
    return {"chats": out}


@router.get("/chats/{chat_id}")
def get_chat_meta(chat_id: int, db: Session = Depends(get_db), auth: tuple[int, str] = Depends(_auth_profile)):
    pid, _auth_h = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch or ch.deleted_globally_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    m = _member(db, ch.id, pid)
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Нет доступа к чату")
    if ch.kind == "event" and ch.event_id:
        ev = fetch_event_public(int(ch.event_id))
        ok, err = _can_read_event_chat(ch, pid, m, ev or {})
        if not ok:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=err or "Нет доступа")
    dm_title, dm_avatar = _dm_peer_display_for_viewer(ch, pid) if ch.kind == "dm" else (ch.title, ch.avatar_url)
    out: dict[str, Any] = {
        "id": ch.id,
        "kind": ch.kind,
        "event_id": ch.event_id,
        "title": dm_title if ch.kind == "dm" else ch.title,
        "subtitle": ch.subtitle,
        "avatar_url": dm_avatar if ch.kind == "dm" else ch.avatar_url,
        "owner_profile_id": ch.owner_profile_id,
        "read_only": m.left_at is not None,
        "notify_muted": bool(m.notify_muted),
        "mute_until": m.mute_until.isoformat() if m.mute_until else None,
    }
    if ch.kind == "dm" and ch.dm_peer_a is not None and ch.dm_peer_b is not None:
        other = int(ch.dm_peer_b) if int(pid) == int(ch.dm_peer_a) else int(ch.dm_peer_a)
        out["peer_profile_id"] = other
        prof_me = fetch_profile_internal(pid)
        prof_peer = fetch_profile_internal(other)
        if prof_me and prof_peer:
            out["i_blocked_them"] = other in _parse_dm_block_ids(prof_me.get("dm_blocked_profile_ids"))
            out["they_blocked_me"] = pid in _parse_dm_block_ids(prof_peer.get("dm_blocked_profile_ids"))
            out["dm_cannot_send"] = _dm_mutually_blocked(prof_me, prof_peer, pid, other)
        else:
            out["i_blocked_them"] = False
            out["they_blocked_me"] = False
            out["dm_cannot_send"] = True
    # Курсоры «прочитано до сообщения» других участников (для галочек при открытии комнаты без истории WS).
    read_rows = (
        db.query(ChatMember.profile_id, ChatMember.last_read_message_id)
        .filter(ChatMember.chat_id == ch.id, ChatMember.profile_id != pid)
        .all()
    )
    out["member_read_cursors"] = {
        str(int(r.profile_id)): int(r.last_read_message_id or 0) for r in read_rows
    }
    return out


@router.get("/chats/{chat_id}/messages")
def list_messages(
    chat_id: int,
    after: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    auth: tuple[int, str] = Depends(_auth_profile),
):
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch or ch.deleted_globally_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    m = _member(db, chat_id, pid)
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Нет доступа")
    if ch.kind == "event" and ch.event_id:
        ev = fetch_event_public(int(ch.event_id))
        ok, err = _can_read_event_chat(ch, pid, m, ev or {})
        if not ok:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=err or "Нет доступа")

    q = db.query(Message).filter(Message.chat_id == chat_id, Message.deleted_globally == 0, Message.id > after)
    q = q.filter(Message.id > m.history_after_message_id)
    if m.left_at is not None and m.leave_cutoff_message_id:
        q = q.filter(Message.id <= m.leave_cutoff_message_id)
    rows = q.order_by(Message.id.asc()).limit(min(limit, 100)).all()
    return {"messages": [_msg_to_dict(db, x) for x in rows]}


class SendMessageBody(BaseModel):
    body: str | None = None
    voice_path: str | None = None
    attachments_json: str | None = Field(None, description="JSON-массив вложений")
    reply_to_message_id: int | None = Field(None, ge=1)


@router.post("/chats/{chat_id}/messages")
async def send_message(
    chat_id: int,
    body: SendMessageBody,
    db: Session = Depends(get_db),
    auth: tuple[int, str] = Depends(_auth_profile),
):
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch or ch.deleted_globally_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    m = _ensure_active_member(db, ch, pid)
    if ch.kind == "event" and ch.event_id:
        ev = fetch_event_public(int(ch.event_id))
        ok, err = event_profile_access(pid, ev or {})
        if not ok:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=err or "Нет доступа")
    if ch.kind == "dm" and ch.dm_peer_a is not None and ch.dm_peer_b is not None:
        peer_id = int(ch.dm_peer_b) if int(pid) == int(ch.dm_peer_a) else int(ch.dm_peer_a)
        prof_me = fetch_profile_internal(pid)
        prof_peer = fetch_profile_internal(peer_id)
        if not prof_me or not prof_peer:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Профиль недоступен")
        if _dm_mutually_blocked(prof_me, prof_peer, pid, peer_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Отправка недоступна")
    now = datetime.now(timezone.utc)
    if m.mute_until and m.mute_until > now:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Вы в муте и не можете писать в этот чат")

    text = (body.body or "").strip()
    voice = (body.voice_path or "").strip() or None
    att_raw = body.attachments_json or "[]"
    try:
        att = json.loads(att_raw)
        if not isinstance(att, list):
            att = []
    except json.JSONDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Некорректные вложения")
    if len(att) > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Не более 100 вложений за одну отправку")
    if voice and text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="У голосового сообщения не должно быть текста")
    if voice and att:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="У голосового сообщения не должно быть вложений")
    if not text and not voice and not att:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Пустое сообщение")

    reply_to_id = body.reply_to_message_id
    if reply_to_id is not None:
        ref = db.query(Message).filter(Message.id == reply_to_id, Message.chat_id == chat_id).first()
        if not ref:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Ответ на несуществующее сообщение")

    plans = _expand_plans_chunk_attachments(_build_send_message_plans(text, voice, att))
    out: list[dict[str, Any]] = []
    for idx, (b, v, aplan) in enumerate(plans):
        if not b and not v and not aplan:
            continue
        rid = reply_to_id if idx == 0 else None
        out.append(await _persist_chat_message(db, chat_id, pid, b, v, list(aplan), reply_to_message_id=rid))
    if not out:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Пустое сообщение")
    await _notify_inbox_new_message(db, ch, pid, out[-1])
    return {"messages": out}


def _assert_can_upload(db: Session, ch: Chat, pid: int) -> ChatMember:
    m = _ensure_active_member(db, ch, pid)
    if ch.kind == "event" and ch.event_id:
        ev = fetch_event_public(int(ch.event_id))
        ok, err = event_profile_access(pid, ev or {})
        if not ok:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=err or "Нет доступа")
    if ch.kind == "dm" and ch.dm_peer_a is not None and ch.dm_peer_b is not None:
        peer_id = int(ch.dm_peer_b) if int(pid) == int(ch.dm_peer_a) else int(ch.dm_peer_a)
        prof_me = fetch_profile_internal(pid)
        prof_peer = fetch_profile_internal(peer_id)
        if not prof_me or not prof_peer:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Профиль недоступен")
        if _dm_mutually_blocked(prof_me, prof_peer, pid, peer_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Отправка недоступна")
    now = datetime.now(timezone.utc)
    if m.mute_until and m.mute_until > now:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Вы в муте и не можете писать в этот чат")
    return m


@router.post("/chats/{chat_id}/upload")
async def upload_chat_file(
    chat_id: int,
    db: Session = Depends(get_db),
    auth: tuple[int, str] = Depends(_auth_profile),
    file: UploadFile = File(...),
):
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch or ch.deleted_globally_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    _assert_can_upload(db, ch, pid)
    raw = await file.read()
    if not raw:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Файл пустой")
    try:
        item = save_chat_upload(chat_id, raw, file.content_type, file.filename)
    except ValueError as exc:
        code = str(exc)
        if code == "too_large":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Файл слишком большой") from exc
        if code == "empty_file":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Файл повреждён") from exc
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Не удалось сохранить файл") from exc
    return item


@router.post("/chats/{chat_id}/upload-voice")
async def upload_chat_voice(
    chat_id: int,
    db: Session = Depends(get_db),
    auth: tuple[int, str] = Depends(_auth_profile),
    file: UploadFile = File(...),
):
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch or ch.deleted_globally_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    _assert_can_upload(db, ch, pid)
    raw = await file.read()
    if not raw:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Файл пустой")
    try:
        path = save_voice_message(chat_id, raw, file.content_type)
    except ValueError as exc:
        code = str(exc)
        if code == "too_large":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Голосовое слишком длинное") from exc
        if code == "empty_file":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Запись пустая") from exc
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Не удалось сохранить") from exc
    return {"voice_path": path}


@router.get("/chats/{chat_id}/members")
def list_chat_members(chat_id: int, db: Session = Depends(get_db), auth: tuple[int, str] = Depends(_auth_profile)):
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch or ch.deleted_globally_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    m = _member(db, chat_id, pid)
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Нет доступа")
    if ch.kind == "event" and ch.event_id:
        ev = fetch_event_public(int(ch.event_id))
        ok, err = _can_read_event_chat(ch, pid, m, ev or {})
        if not ok:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=err or "Нет доступа")
    rows = db.query(ChatMember).filter(ChatMember.chat_id == chat_id, ChatMember.left_at.is_(None)).all()
    return {
        "members": [
            {
                "profile_id": r.profile_id,
                "mute_until": r.mute_until.isoformat() if r.mute_until else None,
                "role": r.role,
            }
            for r in rows
        ]
    }


class EditMessageBody(BaseModel):
    body: str = Field(..., min_length=1, max_length=8000)


@router.patch("/chats/{chat_id}/messages/{message_id}")
async def edit_message(
    chat_id: int,
    message_id: int,
    body: EditMessageBody,
    db: Session = Depends(get_db),
    auth: tuple[int, str] = Depends(_auth_profile),
):
    pid, _ = auth
    msg = db.query(Message).filter(Message.id == message_id, Message.chat_id == chat_id).first()
    if not msg or msg.deleted_globally:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Сообщение не найдено")
    if msg.sender_profile_id != pid:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Редактировать можно только свои сообщения")
    if msg.voice_path:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Голосовое сообщение нельзя редактировать")
    msg.body = body.body.strip()
    msg.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)
    await hub.broadcast(chat_id, {"type": "message_edited", "message": _msg_to_dict(db, msg)})
    return _msg_to_dict(db, msg)


@router.delete("/chats/{chat_id}/messages/{message_id}")
async def delete_message(
    chat_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    auth: tuple[int, str] = Depends(_auth_profile),
):
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    msg = db.query(Message).filter(Message.id == message_id, Message.chat_id == chat_id).first()
    if not msg or msg.deleted_globally:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Сообщение не найдено")
    _ensure_active_member(db, ch, pid)
    can_owner = ch.kind == "event" and ch.owner_profile_id == pid
    can_dm_peer = ch.kind == "dm"
    if msg.sender_profile_id != pid and not can_owner and not can_dm_peer:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Удалить можно только своё, в чате события — ещё и чужое (организатор), в личном — любое сообщение",
        )
    msg.deleted_globally = 1
    db.commit()
    await hub.broadcast(chat_id, {"type": "message_deleted", "message_id": message_id})
    return {"ok": True}


class ReadBody(BaseModel):
    last_read_message_id: int = Field(..., ge=0)


@router.post("/chats/{chat_id}/read")
async def mark_read(
    chat_id: int,
    body: ReadBody,
    db: Session = Depends(get_db),
    auth: tuple[int, str] = Depends(_auth_profile),
):
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    m = _member(db, ch.id, pid)
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Нет доступа")
    if m.left_at is not None:
        return {"ok": True}
    m.last_read_message_id = max(m.last_read_message_id, body.last_read_message_id)
    db.commit()
    await hub.broadcast(chat_id, {"type": "read", "profile_id": pid, "last_read_message_id": m.last_read_message_id})
    return {"ok": True}


class MuteBody(BaseModel):
    duration: str = Field(..., pattern="^(1h|3h|8h|1d)$")


@router.post("/chats/{chat_id}/members/{target_profile_id}/mute")
def mute_member(
    chat_id: int,
    target_profile_id: int,
    body: MuteBody,
    db: Session = Depends(get_db),
    auth: tuple[int, str] = Depends(_auth_profile),
):
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch or ch.kind != "event":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Мут доступен только в чатах событий")
    if ch.owner_profile_id != pid:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Мут выдаёт только организатор")
    if target_profile_id == ch.owner_profile_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Нельзя замутить организатора")
    tgt = _member(db, chat_id, target_profile_id)
    if not tgt or tgt.left_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Участник не в чате")
    deltas = {"1h": timedelta(hours=1), "3h": timedelta(hours=3), "8h": timedelta(hours=8), "1d": timedelta(days=1)}
    tgt.mute_until = datetime.now(timezone.utc) + deltas[body.duration]
    db.commit()
    return {"ok": True, "mute_until": tgt.mute_until.isoformat()}


@router.post("/chats/{chat_id}/clear-my-history")
def clear_my_history(chat_id: int, db: Session = Depends(get_db), auth: tuple[int, str] = Depends(_auth_profile)):
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    m = _member(db, chat_id, pid)
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Нет доступа")
    mid = db.query(func.max(Message.id)).filter(Message.chat_id == chat_id).scalar() or 0
    m.history_after_message_id = int(mid)
    db.commit()
    return {"ok": True}


@router.post("/chats/{chat_id}/purge-messages")
async def purge_all_messages(chat_id: int, db: Session = Depends(get_db), auth: tuple[int, str] = Depends(_auth_profile)):
    """Только организатор чата события и только если событие завершено."""
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch or ch.kind != "event" or not ch.event_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Недоступно")
    if ch.owner_profile_id != pid:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Только организатор")
    ev = fetch_event_public(int(ch.event_id))
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
    if not int(ev.get("completed_flag") or 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Очистить историю для всех можно только после завершения события",
        )
    db.query(Message).filter(Message.chat_id == chat_id).delete()
    db.commit()
    await hub.broadcast(chat_id, {"type": "history_purged", "chat_id": chat_id})
    return {"ok": True}


@router.post("/chats/{chat_id}/delete-for-all")
async def delete_chat_for_everyone(chat_id: int, db: Session = Depends(get_db), auth: tuple[int, str] = Depends(_auth_profile)):
    """Только для чата события после завершения — скрывает чат у всех."""
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch or ch.kind != "event" or not ch.event_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Недоступно")
    if ch.owner_profile_id != pid:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Только организатор")
    ev = fetch_event_public(int(ch.event_id))
    if not ev or not int(ev.get("completed_flag") or 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Удалить чат для всех можно только после завершения события",
        )
    ch.deleted_globally_at = datetime.now(timezone.utc)
    db.commit()
    await hub.broadcast(chat_id, {"type": "chat_deleted", "chat_id": chat_id})
    return {"ok": True}


class NotifyBody(BaseModel):
    muted: bool


@router.post("/chats/{chat_id}/notify")
def set_notify_muted(chat_id: int, body: NotifyBody, db: Session = Depends(get_db), auth: tuple[int, str] = Depends(_auth_profile)):
    pid, _ = auth
    ch = db.query(Chat).filter(Chat.id == chat_id).first()
    if not ch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    m = _ensure_active_member(db, ch, pid)
    m.notify_muted = 1 if body.muted else 0
    db.commit()
    return {"ok": True, "notify_muted": bool(m.notify_muted)}
