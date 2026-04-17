from sqlalchemy import Column, Float, Integer, String, Text

from app.db.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    # логический внешний ключ на пользователя в auth-service (тот же id)
    user_id = Column(Integer, unique=True, nullable=False, index=True)

    name = Column(String(100))
    gender = Column(String(32))
    birth_date = Column(String(16))
    city_name = Column(String(200))
    bio = Column(Text)
    avatar_url = Column(String(512))
    # JSON: [{ "id": "uuidhex", "url": "/media/profile-gallery/...", "kind": "image"|"video" }], новые в начале
    gallery_json = Column(Text, nullable=False, default="[]")
    latitude = Column(Float)
    longitude = Column(Float)

    openness = Column(Float)
    conscientiousness = Column(Float)
    extraversion = Column(Float)
    agreeableness = Column(Float)
    neuroticism = Column(Float)

    # Анкета Big Five: ответы JSON { "FAST_E1": 4, ... }; источник активного вектора short | long
    big_five_source = Column(String(16))  # short | long | NULL
    big_five_short_json = Column(Text, nullable=False, default="{}")
    big_five_long_json = Column(Text, nullable=False, default="{}")
    big_five_recomputed_at = Column(String(40))

    # Веса для match-service: α·сходство по чертам + β·сходство по интересам (сумма ≈ 1).
    match_personality_weight = Column(Float, nullable=False, default=0.7)
    match_interests_weight = Column(Float, nullable=False, default=0.3)

    interests = Column(String(500))

    # Личные сообщения: кто может написать первым (настройка владельца профиля).
    dm_privacy = Column(String(32), nullable=False, default="all")  # all | acquaintances | nobody
    # JSON-массив profile_id — кого я заблокировал в личке (не могу писать и он мне).
    dm_blocked_profile_ids_json = Column(Text, nullable=False, default="[]")
