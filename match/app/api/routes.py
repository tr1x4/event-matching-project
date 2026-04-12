from fastapi import APIRouter

from app.models.user import User
from app.models.event import Event
from app.schemas.match import MatchRequest, EventMatchRequest
from app.services.matching import total_similarity, event_similarity
from app.services.profile_client import get_profile
from app.services.event_client import get_events
from app.services.matching import recommend_events_for_user

router = APIRouter()


@router.get("/test-match")
def test_match():
    """
    Тестовый endpoint для сравнения двух пользователей.
    """

    u1 = User(
        id=1,
        personality=[0.8, 0.3, 0.6, 0.9, 0.2],
        interests=["sport", "music"]
    )

    u2 = User(
        id=2,
        personality=[0.7, 0.4, 0.5, 0.8, 0.3],
        interests=["sport", "movies"]
    )

    score = total_similarity(u1, u2)

    return {
        "user1": u1.id,
        "user2": u2.id,
        "match_score": score
    }


@router.post("/match-users")
def match_users(data: MatchRequest):
    """
    Принимает JSON с двумя пользователями
    и считает их совместимость.
    """

    u1 = User(
        id=data.user1.id,
        personality=data.user1.personality,
        interests=data.user1.interests
    )

    u2 = User(
        id=data.user2.id,
        personality=data.user2.personality,
        interests=data.user2.interests
    )

    score = total_similarity(u1, u2)

    return {
        "user1": u1.id,
        "user2": u2.id,
        "match_score": score
    }


@router.get("/test-event-match")
def test_event_match():
    """
    Тестовый endpoint для сравнения пользователя с событием.
    """

    # пользователь, которого хотим добавить в событие
    target_user = User(
        id=10,
        personality=[0.75, 0.35, 0.60, 0.85, 0.25],
        interests=["sport", "outdoor", "music"]
    )

    # уже существующие участники события
    participant1 = User(
        id=1,
        personality=[0.80, 0.40, 0.65, 0.90, 0.20],
        interests=["sport", "music"]
    )

    participant2 = User(
        id=2,
        personality=[0.70, 0.30, 0.55, 0.80, 0.30],
        interests=["outdoor", "travel"]
    )

    # создаём событие
    event = Event(
        id=100,
        tags=["sport", "outdoor"],
        participants=[participant1, participant2]
    )

    score = event_similarity(target_user, event)

    return {
        "user_id": target_user.id,
        "event_id": event.id,
        "match_score": score
    }


@router.post("/match-event")
def match_event(data: EventMatchRequest):
    """
    Принимает JSON с пользователем и событием,
    считает совместимость пользователя с событием.
    """

    # создаём объект пользователя
    user = User(
        id=data.user.id,
        personality=data.user.personality,
        interests=data.user.interests
    )

    # превращаем участников события из UserInput в User
    participants = []
    for participant_data in data.event.participants:
        participant = User(
            id=participant_data.id,
            personality=participant_data.personality,
            interests=participant_data.interests
        )
        participants.append(participant)

    # создаём объект события
    event = Event(
        id=data.event.id,
        tags=data.event.tags,
        participants=participants
    )

    score = event_similarity(user, event)

    return {
        "user_id": user.id,
        "event_id": event.id,
        "match_score": score
    }

@router.get("/match-from-profiles/{user1_id}/{user2_id}")
def match_from_profiles(user1_id: int, user2_id: int):
    """
    Берёт двух пользователей из profiles-service
    и считает их совместимость.
    """

    # получаем профили по HTTP
    p1 = get_profile(user1_id)
    p2 = get_profile(user2_id)

    # превращаем JSON в внутренние объекты User
    u1 = User(
        id=p1["id"],
        personality=p1["personality"],
        interests=p1["interests"]
    )

    u2 = User(
        id=p2["id"],
        personality=p2["personality"],
        interests=p2["interests"]
    )

    # считаем итоговую совместимость
    score = total_similarity(u1, u2)

    return {
        "user1": u1.id,
        "user2": u2.id,
        "match_score": score
    }

@router.get("/recommend-events/{user_id}")
def recommend_events(user_id: int):
    """
    Возвращает список рекомендованных событий для пользователя.
    """

    # 1. получаем пользователя из profiles-service
    profile_data = get_profile(user_id)

    user = User(
        id=profile_data["id"],
        personality=profile_data["personality"],
        interests=profile_data["interests"]
    )

    # 2. получаем список событий из events-service
    events = get_events()

    # 3. функция, которая по id участника загружает профиль и превращает его в User
    def resolve_participant(participant_id: int):
        participant_data = get_profile(participant_id)

        return User(
            id=participant_data["id"],
            personality=participant_data["personality"],
            interests=participant_data["interests"]
        )

    # 4. считаем рекомендации
    recommendations = recommend_events_for_user(
        user=user,
        events=events,
        participant_resolver=resolve_participant
    )

    return {
        "user_id": user.id,
        "recommendations": recommendations
    }