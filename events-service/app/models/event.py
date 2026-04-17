from sqlalchemy import Column, Float, Integer, String, Text

from app.db.database import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False, default="")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    creator_profile_id = Column(Integer, nullable=False, index=True)
    expected_participants = Column(Integer, nullable=False)
    category_interest_slug = Column(String(120), nullable=False)
    # JSON-массив slug категорий события (первая дублируется в category_interest_slug для совместимости)
    category_slugs_json = Column(Text, nullable=False, default="[]")
    # теги для матчинга (совпадают с категорией или расширяются позже)
    tags = Column(String(500), nullable=False)
    # id профилей участников (как в profiles-service)
    participants = Column(String(500), nullable=False)
    # JSON: [{"url":"/media/events/1/0.jpg","kind":"image"}, ...]
    media = Column(Text, nullable=False, default="[]")

    # ISO 8601 UTC (строка), например 2026-05-01T12:00:00+00:00
    starts_at = Column(String(40), nullable=False, default="")
    # d1..d6, week, longer: см. event_time.DURATION_DAYS
    duration_key = Column(String(16), nullable=False, default="d1")
    # p2 | p3_4 | p5_9 | p10_plus
    participant_bucket = Column(String(16), nullable=False, default="p3_4")
    completed_flag = Column(Integer, nullable=False, default=0)
    hidden_from_discovery = Column(Integer, nullable=False, default=0)
    # JSON: id профилей, исключённых организатором; повторный join запрещён до unblock
    blocked_from_rejoin = Column(Text, nullable=False, default="[]")
