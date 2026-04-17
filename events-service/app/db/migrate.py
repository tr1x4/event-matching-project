"""Сиды справочников. Схема создаётся через SQLAlchemy Base.metadata.create_all."""

from app.db.seed_event_categories import seed_event_categories_if_empty


def run_sqlite_migrations() -> None:
    seed_event_categories_if_empty()
