r"""
Подбор событий и совместимость пользователей.

- **Черты личности (Big Five, 0–1):** взвешенное расстояние по пяти осям (веса осей как в литературе по OCEAN),
  затем сходство = 1 − расстояние (`personality_similarity`).
- **Интересы (пользователь–пользователь):** \(|I_u \cap I_v| / \min(|I_u|, |I_v|)\) при \(\min > 0\), иначе 0.
- **Интересы пользователь–событие:** если у события **ровно один** участник (обычно создатель) — та же формула, что между вами и этим человеком; если **два и более** — по тегам темы: \(|I_u \cap T_e| / \min(|I_u|, |T_e|)\).
- **Итог человек–событие (рекомендации):** α·сходство_личность + β·сходство_интересы (α+β=1), α и β из анкеты **того, кому подбирают**; по умолчанию α=0.7, β=0.3.
- **Вектор личности «события»:** один участник — черты создателя (или единственного участника); **два и более — среднее по участникам** (`target_event_personality_vector`). Если список участников пуст, но известен `creator_profile_id`, в расчёт подставляется создатель.
- **Карточка чужого профиля:** сходство по чертам и по интересам показываются **раздельно**, без смешивания в один процент.
"""
import math
from datetime import datetime, timezone

from app.models.event import Event


def personality_similarity(u1, u2):
    weights = [0.15, 0.20, 0.20, 0.25, 0.20]
    distance = 0
    for i in range(5):
        diff = abs(u1.personality[i] - u2.personality[i])
        distance += weights[i] * diff
    return 1 - distance


def interests_similarity(u1, u2):
    """|I_u ∩ I_v| / min(|I_u|, |I_v|)."""
    a, b = u1.interests, u2.interests
    inter = len(a & b)
    denom = min(len(a), len(b))
    if denom <= 0:
        return 0.0
    return inter / denom


def total_similarity(u1, u2, alpha=0.7, beta=0.3):
    s1 = personality_similarity(u1, u2)
    s2 = interests_similarity(u1, u2)
    return alpha * s1 + beta * s2


def _average_personality_vectors(participants) -> list[float]:
    n = len(participants)
    if n <= 0:
        return [0.5, 0.5, 0.5, 0.5, 0.5]
    avg = [0.0, 0.0, 0.0, 0.0, 0.0]
    for user in participants:
        for i in range(5):
            avg[i] += user.personality[i]
    return [value / n for value in avg]


def target_event_personality_vector(participants, creator_profile_id):
    """
    Вектор личности «события» для матчинга (не хранится в БД):
    - при 0 участниках: нейтральный вектор;
    - при ровно одном: черты создателя (по creator_profile_id, иначе этот участник);
    - при двух и более: **среднее** по личностям всех участников.
    """
    if not participants:
        return [0.5, 0.5, 0.5, 0.5, 0.5]
    n = len(participants)
    if n == 1:
        if creator_profile_id is not None:
            for user in participants:
                if user.id == creator_profile_id:
                    return user.personality
        return participants[0].personality
    return _average_personality_vectors(participants)


def average_personality(event):
    """Средний personality участников (для обратной совместимости тестов)."""
    return _average_personality_vectors(event.participants)


def event_interests_similarity(user, event):
    """|I_u ∩ T_e| / min(|I_u|, |T_e|) — сходство с **темой** события (несколько участников)."""
    iu = user.interests
    it = event.tags if isinstance(event.tags, set) else set(event.tags or [])
    inter = len(iu & it)
    denom = min(len(iu), len(it))
    if denom <= 0:
        return 0.0
    return inter / denom


def event_interests_score(user, event):
    """
    Сходство по интересам для подбора событий.
    Один участник — как совместимость с этим человеком (создатель/единственный в списке).
    Несколько участников — по пересечению с тегами события (общая тема встречи).
    """
    parts = list(event.participants or [])
    if len(parts) == 1:
        return interests_similarity(user, parts[0])
    return event_interests_similarity(user, event)


def event_personality_similarity_vector(user, personality_vec):
    weights = [0.15, 0.20, 0.20, 0.25, 0.20]
    distance = 0
    for i in range(5):
        diff = abs(user.personality[i] - personality_vec[i])
        distance += weights[i] * diff
    return 1 - distance


def event_personality_similarity(user, event):
    """Совместимость с «средним» событием по старой модели (среднее всех участников)."""
    avg_personality = average_personality(event)
    return event_personality_similarity_vector(user, avg_personality)


def compute_personality_vec_for_event_data(event_data: dict, participant_resolver) -> list[float]:
    """Собирает участников и считает вектор личности события (для кэша и рекомендаций)."""
    participants = []
    for participant_id in event_data.get("participants") or []:
        participants.append(participant_resolver(int(participant_id)))
    creator_profile_id = event_data.get("creator_profile_id")
    if creator_profile_id is None and event_data.get("participants"):
        try:
            creator_profile_id = int(event_data["participants"][0])
        except (TypeError, ValueError, IndexError):
            creator_profile_id = None
    if not participants and creator_profile_id is not None:
        participants.append(participant_resolver(int(creator_profile_id)))
    return target_event_personality_vector(participants, creator_profile_id)


def event_similarity(
    user,
    event,
    alpha=0.7,
    beta=0.3,
    creator_profile_id=None,
    event_personality_vec: list[float] | None = None,
):
    cid = creator_profile_id
    if cid is None and getattr(event, "creator_profile_id", None) is not None:
        cid = event.creator_profile_id
    if event_personality_vec is not None:
        vec = event_personality_vec
    else:
        vec = target_event_personality_vector(event.participants, cid)
    s_personality = event_personality_similarity_vector(user, vec)
    s_interests = event_interests_score(user, event)
    return alpha * s_personality + beta * s_interests


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Расстояние по сфере между двумя точками в километрах."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return r * c


def _event_start_sort_key(event_data: dict) -> float:
    """Меньшее значение — более ранняя дата (выше в списке при сортировке по дате)."""
    raw = event_data.get("starts_at")
    if not raw:
        return float("inf")
    s = str(raw).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return float("inf")


def recommend_events_for_user(
    user,
    events,
    participant_resolver,
    alpha=0.7,
    beta=0.3,
    ref_lat: float | None = None,
    ref_lng: float | None = None,
):
    from app.services import event_derivatives as edv

    recommendations = []

    for event_data in events:
        eid = int(event_data["id"])
        pids_tuple = tuple(sorted(int(x) for x in (event_data.get("participants") or [])))
        creator_profile_id = event_data.get("creator_profile_id")
        if creator_profile_id is None and event_data.get("participants"):
            try:
                creator_profile_id = int(event_data["participants"][0])
            except (TypeError, ValueError, IndexError):
                creator_profile_id = None

        cached_vec = edv.get_personality_vec(eid, pids_tuple)

        participants: list = []
        for participant_id in event_data.get("participants") or []:
            participants.append(participant_resolver(int(participant_id)))
        if not participants and creator_profile_id is not None:
            participants.append(participant_resolver(int(creator_profile_id)))

        if cached_vec is not None:
            event = Event(
                id=eid,
                tags=event_data.get("tags") or [],
                participants=participants,
                creator_profile_id=creator_profile_id,
            )
            score = event_similarity(
                user,
                event,
                alpha=alpha,
                beta=beta,
                creator_profile_id=creator_profile_id,
                event_personality_vec=cached_vec,
            )
        else:
            event = Event(
                id=eid,
                tags=event_data.get("tags") or [],
                participants=participants,
                creator_profile_id=creator_profile_id,
            )

            score = event_similarity(
                user, event, alpha=alpha, beta=beta, creator_profile_id=creator_profile_id
            )
            try:
                vec = compute_personality_vec_for_event_data(event_data, participant_resolver)
                edv.put_personality_vec(eid, pids_tuple, vec)
            except Exception:
                pass

        if score < 0.5:
            continue

        cats = event_data.get("category_slugs")
        if not isinstance(cats, list) or not cats:
            slug = event_data.get("category_interest_slug")
            cats = [str(slug)] if slug else []

        d_km = None
        if ref_lat is not None and ref_lng is not None:
            try:
                ela = float(event_data.get("latitude"))
                elo = float(event_data.get("longitude"))
                if math.isfinite(ela) and math.isfinite(elo):
                    d_km = round(_haversine_km(ref_lat, ref_lng, ela, elo), 2)
            except (TypeError, ValueError):
                d_km = None

        row = {
            "event_id": event_data["id"],
            "match_score": score,
            "title": event_data.get("title"),
            "description": event_data.get("description"),
            "latitude": event_data.get("latitude"),
            "longitude": event_data.get("longitude"),
            "expected_participants": event_data.get("expected_participants"),
            "category_interest_slug": event_data.get("category_interest_slug"),
            "category_slugs": [str(x) for x in cats if str(x).strip()],
            "tags": event_data.get("tags") or [],
            "participants": event_data.get("participants") or [],
            "media": event_data.get("media") or [],
            "creator_profile_id": creator_profile_id,
            "starts_at": event_data.get("starts_at"),
            "duration_key": event_data.get("duration_key"),
            "participant_bucket": event_data.get("participant_bucket"),
            "status": event_data.get("status"),
            "hidden_from_discovery": event_data.get("hidden_from_discovery"),
            "distance_km": d_km,
        }
        row["_sort_dist"] = d_km if d_km is not None else 1e12
        row["_sort_start"] = _event_start_sort_key(event_data)
        recommendations.append(row)

    recommendations.sort(
        key=lambda item: (-float(item["match_score"]), float(item["_sort_dist"]), float(item["_sort_start"]))
    )

    for r in recommendations:
        r.pop("_sort_dist", None)
        r.pop("_sort_start", None)

    return recommendations
