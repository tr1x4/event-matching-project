"""Ровно 40 категорий событий для пустой БД (slug совместим с валидацией в API)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.event_category import EventCategory

# 40 записей: slug, label_ru, sort_order
CATEGORIES_SEED: list[tuple[str, str, int]] = [
    ("music_events", "Музыка и концерты", 1),
    ("sport_outdoor", "Спорт на улице", 2),
    ("food_tasting", "Еда и дегустации", 3),
    ("board_games_night", "Настольные игры", 4),
    ("cinema_club", "Кино и сериалы", 5),
    ("theater_goers", "Театр", 6),
    ("photo_walk", "Фото и прогулки", 7),
    ("running_group", "Бег и кардио", 8),
    ("yoga_morning", "Йога и растяжка", 9),
    ("tech_meetup", "IT и технологии", 10),
    ("startup_pitch", "Стартапы и бизнес", 11),
    ("books_club", "Книги и клубы чтения", 12),
    ("languages_exchange", "Языки и практика", 13),
    ("volunteer_day", "Волонтёрство", 14),
    ("pet_meetup", "Питомцы и прогулки", 15),
    ("hiking_weekend", "Походы и треккинг", 16),
    ("museum_tour", "Музеи и экскурсии", 17),
    ("concert_live", "Живые выступления", 18),
    ("dance_social", "Танцы", 19),
    ("fitness_workout", "Фитнес и зал", 20),
    ("board_creativity", "Творчество и мастер-классы", 21),
    ("esports_lan", "Киберспорт", 22),
    ("astronomy_night", "Астрономия и небо", 23),
    ("city_quest", "Квесты по городу", 24),
    ("karaoke_night", "Караоке", 25),
    ("camping_trip", "Кемпинг и палатки", 26),
    ("masterclass_cooking", "Кулинарные мастер-классы", 27),
    ("art_workshop", "Искусство и воркшопы", 28),
    ("meditation_group", "Медитация и осознанность", 29),
    ("cycling_ride", "Велопрогулки", 30),
    ("charity_run", "Благотворительные забеги", 31),
    ("quiz_night", "Квизы и интеллект", 32),
    ("open_air", "Open air и фестивали", 33),
    ("jazz_session", "Джаз и лайв", 34),
    ("crafts_fair", "Ремёсла и ярмарки", 35),
    ("science_cafe", "Наука и лекции", 36),
    ("history_walk", "История города", 37),
    ("comedy_standup", "Стендап и юмор", 38),
    ("fashion_swap", "Мода и свопы", 39),
    ("wine_tasting", "Вино и дегустации", 40),
]


def seed_event_categories_if_empty() -> None:
    db: Session = SessionLocal()
    try:
        n = db.scalar(select(EventCategory.id).limit(1))
        if n is not None:
            return
        for slug, label_ru, sort_order in CATEGORIES_SEED:
            db.add(EventCategory(slug=slug, label_ru=label_ru, sort_order=sort_order))
        db.commit()
    finally:
        db.close()
