from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from app.db.database import Base


class Chat(Base):
    __tablename__ = "chats"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(16), nullable=False)  # event | dm
    event_id = Column(Integer, nullable=True, unique=True, index=True)
    dm_peer_a = Column(Integer, nullable=True, index=True)
    dm_peer_b = Column(Integer, nullable=True, index=True)
    title = Column(String(300), nullable=False, default="")
    subtitle = Column(Text, nullable=False, default="")
    avatar_url = Column(String(512), nullable=False, default="")
    owner_profile_id = Column(Integer, nullable=True)
    deleted_globally_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChatMember(Base):
    __tablename__ = "chat_members"

    chat_id = Column(Integer, ForeignKey("chats.id", ondelete="CASCADE"), primary_key=True)
    profile_id = Column(Integer, primary_key=True)
    role = Column(String(16), nullable=False, default="member")  # owner | member
    mute_until = Column(DateTime(timezone=True), nullable=True)
    notify_muted = Column(Integer, nullable=False, default=0)
    history_after_message_id = Column(Integer, nullable=False, default=0)
    left_at = Column(DateTime(timezone=True), nullable=True)
    leave_cutoff_message_id = Column(Integer, nullable=False, default=0)
    last_read_message_id = Column(Integer, nullable=False, default=0)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_profile_id = Column(Integer, nullable=False, index=True)
    is_system = Column(Integer, nullable=False, default=0)
    body = Column(Text, nullable=True)
    voice_path = Column(String(512), nullable=True)
    attachments_json = Column(Text, nullable=False, default="[]")
    reply_to_message_id = Column(Integer, nullable=True, index=True)
    edited_at = Column(DateTime(timezone=True), nullable=True)
    deleted_globally = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
