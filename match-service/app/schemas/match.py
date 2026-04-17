from pydantic import BaseModel
from typing import List


class UserInput(BaseModel):
    # id пользователя
    id: int

    # personality - список из 5 чисел [O, C, E, A, N]
    personality: List[float]

    # список интересов пользователя
    interests: List[str]


class MatchRequest(BaseModel):
    # первый пользователь
    user1: UserInput

    # второй пользователь
    user2: UserInput


class EventInput(BaseModel):
    # id события
    id: int

    # теги события
    tags: List[str]

    # список участников события
    participants: List[UserInput]

    # id профиля создателя (для правила <=2 участников: вектор создателя)
    creator_profile_id: int | None = None


class EventMatchRequest(BaseModel):
    # пользователь, которого хотим проверить на совместимость с событием
    user: UserInput

    # событие
    event: EventInput