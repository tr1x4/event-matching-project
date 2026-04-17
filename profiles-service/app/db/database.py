import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# SQLite: локально ./profiles.db, в Docker: sqlite:////data/profiles.db
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./profiles.db")

# connect_args нужен только для SQLite
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(bind=engine)

Base = declarative_base()