from sqlalchemy import Column, ForeignKey, Integer, String

from app.db.database import Base


class Interest(Base):
    __tablename__ = "interests"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(64), unique=True, nullable=False, index=True)
    label_ru = Column(String(160), nullable=False)
    icon = Column(String(16), nullable=False, default="✨")
    sort_order = Column(Integer, nullable=False, default=0)


class ProfileInterest(Base):
    __tablename__ = "profile_interests"

    profile_id = Column(Integer, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    interest_id = Column(Integer, ForeignKey("interests.id", ondelete="CASCADE"), primary_key=True)
