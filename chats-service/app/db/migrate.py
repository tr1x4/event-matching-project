"""ALTER-миграции SQLite (таблицы создаёт Base.metadata.create_all)."""

from sqlalchemy import text

from app.db.database import engine


def run_sqlite_migrations() -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(messages)")).fetchall()
        col_names = {r[1] for r in rows}
        if "reply_to_message_id" not in col_names:
            conn.execute(text("ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER NULL"))
        if "is_system" not in col_names:
            conn.execute(text("ALTER TABLE messages ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0"))
