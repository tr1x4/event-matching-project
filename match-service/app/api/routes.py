import hashlib
import json
import os

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.api.deps import require_auth_header
from app.models.user import User
from app.models.event import Event
from app.schemas.match import MatchRequest, EventMatchRequest
from app.services.matching import (
    event_similarity,
    interests_similarity,
    personality_similarity,
    recommend_events_for_user,
    total_similarity,
)
from app.services.profile_client import get_my_profile, get_profile, get_profile_cached
from app.services.event_client import get_events_cached
from app.services import event_derivatives, ttl_cache
from app.services.geo_distance import filter_events_within_km
from app.services.recommendation_filters import filter_events_for_recommendations

router = APIRouter()

_ALLOWED_RECOMMEND_RADIUS = frozenset({"5", "10", "25", "50", "100", "russia"})


def _verify_internal_match_token(
    x_service_token: str | None = Header(None, alias="X-Service-Token"),
) -> None:
    expected = (os.environ.get("INTERNAL_MATCH_TOKEN") or "dev-internal-match-token").strip()
    if (x_service_token or "").strip() != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа")


def _normalize_match_weights(profile: dict) -> tuple[float, float]:
    """α — вклад сходства по чертам, β — по интересам (из анкеты пользователя)."""
    try:
        a = float(profile.get("match_personality_weight", 0.7))
        b = float(profile.get("match_interests_weight", 0.3))
    except (TypeError, ValueError):
        return 0.7, 0.3
    s = a + b
    if s <= 0:
        return 0.7, 0.3
    return a / s, b / s


@router.post(
    "/internal/event-derivatives/{event_id}",
    dependencies=[Depends(_verify_internal_match_token)],
)
def internal_enqueue_event_derivatives(event_id: int):
    """Вызывается events-service после изменения участников: фоновой пересчёт кэша на match."""
    event_derivatives.enqueue_event_rebuild(int(event_id))
    return {"ok": True, "event_id": int(event_id)}


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
        participants=[participant1, participant2],
        creator_profile_id=1,
    )

    score = event_similarity(target_user, event, creator_profile_id=1)

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
        participants=participants,
        creator_profile_id=data.event.creator_profile_id,
    )

    score = event_similarity(
        user, event, creator_profile_id=data.event.creator_profile_id
    )

    return {
        "user_id": user.id,
        "event_id": event.id,
        "match_score": score
    }

@router.get("/match-from-profiles/{user1_id}/{user2_id}")
def match_from_profiles(
    user1_id: int,
    user2_id: int,
    authorization: str = Depends(require_auth_header),
):
    """
    Совместимость двух профилей по формуле подбора **событий**: α·личность + β·интересы,
    где α и β берутся из анкеты **текущего пользователя** (JWT), а не усредняются между парой.
    Один из id в пути должен совпадать с профилем вызывающего.
    """
    me = get_my_profile(authorization)
    my_id = int(me["id"])
    a = int(user1_id)
    b = int(user2_id)
    if my_id not in (a, b):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Один из профилей в запросе должен быть вашим.",
        )

    p1 = get_profile(a)
    p2 = get_profile(b)

    u1 = User(
        id=p1["id"],
        personality=p1["personality"],
        interests=p1["interests"],
    )

    u2 = User(
        id=p2["id"],
        personality=p2["personality"],
        interests=p2["interests"],
    )

    alpha, beta = _normalize_match_weights(me)
    score = total_similarity(u1, u2, alpha=alpha, beta=beta)

    return {
        "user1": u1.id,
        "user2": u2.id,
        "match_score": score,
        "match_personality_weight": alpha,
        "match_interests_weight": beta,
    }

@router.get("/recommend-events")
def recommend_events(
    authorization: str = Depends(require_auth_header),
    search_radius: str = Query(
        "25",
        description="Радиус от центра города в профиле: 5, 10, 25, 50, 100 (км) или russia без ограничения по расстоянию.",
    ),
    categories: str | None = Query(
        None,
        description="Необязательно: slug категорий через запятую (как у интересов). Пусто: все категории.",
    ),
    search_lat: float | None = Query(
        None,
        description="Необязательно: широта центра поиска (км-радиус). Вместе с search_lng — без смены города в анкете.",
    ),
    search_lng: float | None = Query(
        None,
        description="Необязательно: долгота центра поиска. Оба параметра или ни одного.",
    ),
):
    """
    Рекомендации для текущего пользователя (JWT → профиль в profiles-service).
    """
    sr = (search_radius or "russia").strip().lower()
    if sr not in _ALLOWED_RECOMMEND_RADIUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Параметр search_radius: одно из значений 5, 10, 25, 50, 100 (км) или russia.",
        )

    profile_data = get_my_profile(authorization)
    if not profile_data.get("is_complete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Заполните профиль полностью (не менее 5 интересов, имя, пол, дата рождения, город, черты личности).",
        )

    alpha, beta = _normalize_match_weights(profile_data)

    user = User(
        id=profile_data["id"],
        personality=profile_data["personality"],
        interests=profile_data["interests"],
    )

    cat_slugs_pre = tuple(sorted({s.strip() for s in (categories or "").split(",") if s.strip()}))
    cache_key_payload = {
        "pid": int(profile_data["id"]),
        "sr": sr,
        "cats": cat_slugs_pre,
        "slat": round(float(search_lat), 4) if search_lat is not None else None,
        "slng": round(float(search_lng), 4) if search_lng is not None else None,
        "a": round(alpha, 4),
        "b": round(beta, 4),
    }
    cache_key = "rec:" + hashlib.sha256(
        json.dumps(cache_key_payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    hit = ttl_cache.get_cached(cache_key)
    if hit is not None:
        return hit

    events = get_events_cached()
    if not isinstance(events, list):
        events = []

    ref_lat: float | None = None
    ref_lng: float | None = None

    if sr != "russia":
        plat, plng = profile_data.get("latitude"), profile_data.get("longitude")
        if search_lat is not None or search_lng is not None:
            if search_lat is None or search_lng is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Передайте оба параметра search_lat и search_lng или ни одного.",
                )
            try:
                la = float(search_lat)
                lo = float(search_lng)
            except (TypeError, ValueError):
                la, lo = float("nan"), float("nan")
            if not (-90.0 <= la <= 90.0 and -180.0 <= lo <= 180.0):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Некорректные координаты центра поиска.",
                )
            plat, plng = la, lo
        if plat is None or plng is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="В профиле нет координат города. Укажите город в анкете или выберите поиск «Вся Россия».",
            )
        try:
            max_km = float(sr)
        except ValueError:
            max_km = 0.0
        events = filter_events_within_km(events, float(plat), float(plng), max_km)
        ref_lat, ref_lng = float(plat), float(plng)
    else:
        if search_lat is not None or search_lng is not None:
            if search_lat is None or search_lng is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Передайте оба параметра search_lat и search_lng или ни одного.",
                )
            try:
                la = float(search_lat)
                lo = float(search_lng)
            except (TypeError, ValueError):
                la, lo = float("nan"), float("nan")
            if not (-90.0 <= la <= 90.0 and -180.0 <= lo <= 180.0):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Некорректные координаты центра поиска.",
                )
            ref_lat, ref_lng = la, lo
        else:
            p_lat, p_lng = profile_data.get("latitude"), profile_data.get("longitude")
            if p_lat is not None and p_lng is not None:
                try:
                    ref_lat, ref_lng = float(p_lat), float(p_lng)
                except (TypeError, ValueError):
                    ref_lat, ref_lng = None, None

    events = filter_events_for_recommendations(events, int(profile_data["id"]))

    cat_slugs = set(cat_slugs_pre)

    def _event_cat_slugs(ev: dict) -> set[str]:
        raw = ev.get("category_slugs")
        if isinstance(raw, list):
            return {str(x).strip() for x in raw if str(x).strip()}
        s = str(ev.get("category_interest_slug") or "").strip()
        return {s} if s else set()

    if cat_slugs:
        events = [e for e in events if isinstance(e, dict) and (_event_cat_slugs(e) & cat_slugs)]

    def resolve_participant(participant_id: int):
        participant_data = get_profile_cached(participant_id)
        return User(
            id=participant_data["id"],
            personality=participant_data["personality"],
            interests=participant_data["interests"],
        )

    recommendations = recommend_events_for_user(
        user=user,
        events=events,
        participant_resolver=resolve_participant,
        ref_lat=ref_lat,
        ref_lng=ref_lng,
        alpha=alpha,
        beta=beta,
    )

    out = {
        "profile_id": user.id,
        "user_id": profile_data.get("user_id"),
        "search_radius": sr,
        "recommendations": recommendations,
    }
    ttl_cache.set_cached(cache_key, out, float(os.environ.get("MATCH_RECOMMEND_CACHE_TTL", "90")))
    return out


@router.get("/profile-compat/{other_profile_id}")
def profile_compat_with_me(
    other_profile_id: int,
    authorization: str = Depends(require_auth_header),
):
    """Совместимость с другим профилем: **только** сходство по чертам и по интересам отдельно (без взвешенного итога).
    Взвешенная формула α·личность + β·интересы используется только в подборе **событий**."""
    me = get_my_profile(authorization)
    my_id = int(me["id"])
    if my_id == int(other_profile_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя сравнить профиль с самим собой",
        )
    other = get_profile(other_profile_id)
    u1 = User(id=my_id, personality=me["personality"], interests=me["interests"])
    u2 = User(id=int(other["id"]), personality=other["personality"], interests=other["interests"])
    p = personality_similarity(u1, u2)
    i = interests_similarity(u1, u2)
    return {
        "personality_similarity": p,
        "interests_similarity": i,
    }