"""Сиды справочника интересов (50 записей) для пустой БД."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.interest import Interest

# (slug, label_ru, icon, sort_order)
INTERESTS_SEED: list[tuple[str, str, str, int]] = [
    ("music", "Музыка", "🎵", 1),
    ("sport", "Спорт", "⚽", 2),
    ("travel", "Путешествия", "✈️", 3),
    ("movies", "Кино и сериалы", "🎬", 4),
    ("books", "Книги", "📚", 5),
    ("games", "Видеоигры", "🎮", 6),
    ("photo", "Фотография", "📷", 7),
    ("cooking", "Кулинария", "🍳", 8),
    ("tech", "Технологии", "💻", 9),
    ("science", "Наука", "🔬", 10),
    ("art", "Искусство", "🎨", 11),
    ("dance", "Танцы", "💃", 12),
    ("theater", "Театр", "🎭", 13),
    ("volunteer", "Волонтёрство", "🤝", 14),
    ("pets", "Животные", "🐾", 15),
    ("nature", "Природа", "🌿", 16),
    ("fitness", "Фитнес", "🏋️", 17),
    ("yoga", "Йога", "🧘", 18),
    ("boardgames", "Настольные игры", "🎲", 19),
    ("startup", "Стартапы", "🚀", 20),
    ("invest", "Инвестиции", "📈", 21),
    ("design", "Дизайн", "✏️", 22),
    ("languages", "Иностранные языки", "🌍", 23),
    ("history", "История", "🏛️", 24),
    ("board_ski", "Зимний спорт", "⛷️", 25),
    ("hiking", "Походы", "🥾", 26),
    ("board_water", "Плавание и дайвинг", "🏊", 27),
    ("board_motor", "Авто и мото", "🏎️", 28),
    ("board_astronomy", "Астрономия", "🔭", 29),
    ("board_esports", "Киберспорт", "🏆", 30),
    ("fashion", "Мода и стиль", "👗", 31),
    ("beauty", "Красота и уход", "✨", 32),
    ("gardening", "Сад и огород", "🌻", 33),
    ("crypto", "Криптовалюты", "₿", 34),
    ("blogging", "Блогинг и медиа", "📝", 35),
    ("podcast", "Подкасты", "🎙️", 36),
    ("anime", "Аниме и манга", "🎌", 37),
    ("diy", "Рукоделие и DIY", "🔧", 38),
    ("chess", "Шахматы и логика", "♟️", 39),
    ("sailing", "Яхты и парус", "⛵", 40),
    ("architecture", "Архитектура", "🏗️", 41),
    ("medicine", "Медицина и здоровье", "⚕️", 42),
    ("education", "Обучение и курсы", "📖", 43),
    ("parenting", "Семья и дети", "👪", 44),
    ("law", "Право и общество", "⚖️", 45),
    ("psychology", "Психология", "🧠", 46),
    ("esoteric", "Эзотерика и осознанность", "🔮", 47),
    ("wine", "Вино и дегустации", "🍷", 48),
    ("board_fishing", "Рыбалка", "🎣", 49),
    ("board_meditation", "Медитация", "🕉️", 50),
]


def seed_interests_if_empty() -> None:
    db: Session = SessionLocal()
    try:
        n = db.scalar(select(Interest.id).limit(1))
        if n is not None:
            return
        for slug, label_ru, icon, sort_order in INTERESTS_SEED:
            db.add(
                Interest(
                    slug=slug,
                    label_ru=label_ru,
                    icon=icon,
                    sort_order=sort_order,
                )
            )
        db.commit()
    finally:
        db.close()
