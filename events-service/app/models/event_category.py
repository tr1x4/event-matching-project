from sqlalchemy import Column, Integer, String

from app.db.database import Base


class EventCategory(Base):
    """Справочник категорий событий (сиды при первом запуске)."""

    __tablename__ = "event_categories"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(80), unique=True, nullable=False, index=True)
    label_ru = Column(String(200), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
