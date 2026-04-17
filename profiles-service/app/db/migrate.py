"""Сиды справочников. Схема таблиц создаётся через SQLAlchemy Base.metadata.create_all."""

from app.db.seed_reference import seed_interests_if_empty


def run_sqlite_migrations() -> None:
    seed_interests_if_empty()
