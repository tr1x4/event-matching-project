from sqlalchemy import Column, Integer, String
from app.db.database import Base


class Event(Base):
    __tablename__ = "events"

    # id события
    id = Column(Integer, primary_key=True, index=True)

    # название события
    title = Column(String(200), nullable=False)

    # теги события в виде JSON-строки
    tags = Column(String(500), nullable=False)

    # список id участников в виде JSON-строки
    participants = Column(String(500), nullable=False)