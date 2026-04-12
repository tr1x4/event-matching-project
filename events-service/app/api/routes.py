from fastapi import APIRouter
from app.db.database import SessionLocal
from app.models.event import Event
import json


router = APIRouter()


@router.post("/events")
def create_event(data: dict):
    """
    Создаёт новое событие.
    """

    db = SessionLocal()

    event = Event(
        title=data.get("title"),
        tags=json.dumps(data.get("tags", [])),
        participants=json.dumps(data.get("participants", []))
    )

    db.add(event)
    db.commit()
    db.refresh(event)

    return {"id": event.id}


@router.get("/events")
def get_events():
    """
    Возвращает список всех событий.
    """

    db = SessionLocal()

    events = db.query(Event).all()

    result = []

    for event in events:
        result.append({
            "id": event.id,
            "title": event.title,
            "tags": json.loads(event.tags),
            "participants": json.loads(event.participants)
        })

    return result


@router.get("/events/{event_id}")
def get_event(event_id: int):
    """
    Возвращает одно событие по id.
    """

    db = SessionLocal()

    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        return {"error": "not found"}

    return {
        "id": event.id,
        "title": event.title,
        "tags": json.loads(event.tags),
        "participants": json.loads(event.participants)
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