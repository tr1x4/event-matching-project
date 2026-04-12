from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# SQLite база для events-service
DATABASE_URL = "sqlite:///./events.db"

# Для SQLite нужен этот параметр
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

# Фабрика сессий для работы с БД
SessionLocal = sessionmaker(bind=engine)

# Базовый класс для моделей
Base = declarative_base()