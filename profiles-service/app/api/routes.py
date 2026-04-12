from fastapi import APIRouter
from app.db.database import SessionLocal
from app.models.profile import Profile
import json

router = APIRouter()


@router.post("/profiles")
def create_profile(data: dict):
    """
    Создаёт профиль пользователя
    """

    db = SessionLocal()

    profile = Profile(
        name=data.get("name"),

        openness=data.get("openness"),
        conscientiousness=data.get("conscientiousness"),
        extraversion=data.get("extraversion"),
        agreeableness=data.get("agreeableness"),
        neuroticism=data.get("neuroticism"),

        interests=json.dumps(data.get("interests", []))
    )

    db.add(profile)
    db.commit()
    db.refresh(profile)

    return {"id": profile.id}

@router.get("/profiles/{profile_id}")
def get_profile(profile_id: int):
    db = SessionLocal()

    profile = db.query(Profile).filter(Profile.id == profile_id).first()

    if not profile:
        return {"error": "not found"}

    return {
        "id": profile.id,
        "name": profile.name,
        "personality": [
            profile.openness,
            profile.conscientiousness,
            profile.extraversion,
            profile.agreeableness,
            profile.neuroticism
        ],
        "interests": json.loads(profile.interests)
    }