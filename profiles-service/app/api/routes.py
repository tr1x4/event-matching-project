import json
import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.db.database import SessionLocal
from app.models.interest import Interest, ProfileInterest
from app.models.profile import Profile
from app.schemas.interests import InterestsPutBody
from app.schemas.questionnaire import QuestionnaireAnswersBody
from app.services.bfi_questions import FAST_CODES, FAST_QUESTIONS, LONG_CODES, LONG_QUESTIONS
from app.services.bfi_scoring import apply_vector_to_profile, score_from_answers
from app.services.avatar_storage import delete_user_files, save_user_avatar
from app.services.profile_gallery_storage import add_gallery_item, delete_gallery_file
from app.services.geo_suggest import (
    GeoSuggestAuthError,
    GeoSuggestNotConfigured,
    GeoSuggestRateLimited,
    suggest_russian_cities,
)

router = APIRouter()

_FORBIDDEN_MANUAL_TRAITS = frozenset(
    {"openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"}
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _interest_slugs_for_profile(db: Session, profile: Profile) -> list[str]:
    rows = (
        db.query(Interest.slug)
        .join(ProfileInterest, ProfileInterest.interest_id == Interest.id)
        .filter(ProfileInterest.profile_id == profile.id)
        .order_by(Interest.sort_order)
        .all()
    )
    slugs = [r[0] for r in rows]
    if slugs:
        return slugs
    try:
        legacy = json.loads(profile.interests or "[]")
        if isinstance(legacy, list):
            return [str(x) for x in legacy]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


def _selected_interest_cards(db: Session, profile_id: int) -> list[dict]:
    rows = (
        db.query(Interest.id, Interest.label_ru, Interest.icon, Interest.slug)
        .join(ProfileInterest, ProfileInterest.interest_id == Interest.id)
        .filter(ProfileInterest.profile_id == profile_id)
        .order_by(Interest.sort_order)
        .all()
    )
    return [{"id": r[0], "label_ru": r[1], "icon": r[2], "slug": r[3]} for r in rows]


def _sync_interests_json(db: Session, profile: Profile) -> None:
    profile.interests = json.dumps(_interest_slugs_for_profile(db, profile))


def _gallery_list_from_profile(p: Profile) -> list[dict]:
    try:
        raw = p.gallery_json or "[]"
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError, AttributeError):
        return []
    if not isinstance(data, list):
        return []
    out: list[dict] = []
    for x in data:
        if not isinstance(x, dict):
            continue
        url = x.get("url")
        kind = x.get("kind")
        mid = x.get("id")
        if not isinstance(url, str) or kind not in ("image", "video"):
            continue
        if not isinstance(mid, str) or len(mid) < 8:
            continue
        out.append({"id": mid, "url": url, "kind": kind})
    return out


def _gallery_dump(items: list[dict]) -> str:
    return json.dumps(items, ensure_ascii=False)


def _dm_blocked_ids_list(p: Profile) -> list[int]:
    raw = getattr(p, "dm_blocked_profile_ids_json", None) or "[]"
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    out: list[int] = []
    for x in data:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            continue
    return sorted(set(out))


def _set_dm_blocked_ids(p: Profile, ids: list[int]) -> None:
    p.dm_blocked_profile_ids_json = json.dumps(sorted(set(ids)), ensure_ascii=False)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_json_object(raw: str | None) -> dict:
    try:
        d = json.loads(raw or "{}")
    except (json.JSONDecodeError, TypeError):
        return {}
    return d if isinstance(d, dict) else {}


def _answers_valid_for_codes(codes: frozenset[str], answers: dict) -> bool:
    if frozenset(answers.keys()) != codes:
        return False
    for v in answers.values():
        if not isinstance(v, int) or v < 1 or v > 5:
            return False
    return True


def _reject_manual_big_five(data: dict) -> None:
    if _FORBIDDEN_MANUAL_TRAITS & frozenset(data.keys()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Черты личности нельзя задать вручную. Пройдите короткую или полную анкету Big Five.",
        )


def _questionnaire_meta(p: Profile) -> dict:
    sd = _parse_json_object(getattr(p, "big_five_short_json", None))
    ld = _parse_json_object(getattr(p, "big_five_long_json", None))
    src = (getattr(p, "big_five_source", None) or "").strip() or None
    if src not in ("short", "long", None):
        src = None
    short_done = _answers_valid_for_codes(FAST_CODES, sd)
    long_done = _answers_valid_for_codes(LONG_CODES, ld)
    return {
        "source": src,
        "short_completed": short_done,
        "long_completed": long_done,
        "recomputed_at": getattr(p, "big_five_recomputed_at", None),
    }


def _profile_is_complete(db: Session, p: Profile) -> bool:
    if not p.name or not str(p.name).strip():
        return False
    if p.gender not in ("male", "female"):
        return False
    if not p.birth_date or not str(p.birth_date).strip():
        return False
    if p.latitude is None or p.longitude is None:
        return False
    if not p.city_name or not str(p.city_name).strip():
        return False
    traits = [p.openness, p.conscientiousness, p.extraversion, p.agreeableness, p.neuroticism]
    if any(x is None for x in traits):
        return False
    if len(_interest_slugs_for_profile(db, p)) < 5:
        return False
    return True


def _profile_to_dict(db: Session, p: Profile, include_private: bool = False) -> dict:
    slugs = _interest_slugs_for_profile(db, p)
    privacy = (getattr(p, "dm_privacy", None) or "all").strip()
    if privacy not in ("all", "acquaintances", "nobody"):
        privacy = "all"
    d: dict = {
        "id": p.id,
        "user_id": p.user_id,
        "name": p.name,
        "gender": p.gender,
        "birth_date": p.birth_date,
        "city_name": p.city_name,
        "avatar_url": p.avatar_url,
        "bio": p.bio,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "personality": [
            p.openness,
            p.conscientiousness,
            p.extraversion,
            p.agreeableness,
            p.neuroticism,
        ],
        "interests": slugs,
        "selected_interests": _selected_interest_cards(db, p.id),
        "is_complete": _profile_is_complete(db, p),
        "gallery": _gallery_list_from_profile(p),
        "dm_privacy": privacy,
    }
    if include_private:
        d["dm_blocked_profile_ids"] = _dm_blocked_ids_list(p)
        mp = getattr(p, "match_personality_weight", None)
        mi = getattr(p, "match_interests_weight", None)
        if mp is None or mi is None:
            mp, mi = 0.7, 0.3
        d["match_personality_weight"] = float(mp)
        d["match_interests_weight"] = float(mi)
        d["questionnaire"] = _questionnaire_meta(p)
    return d


def _validate_gender_value(data: dict) -> None:
    if "gender" not in data:
        return
    g = data.get("gender")
    if g is None:
        return
    if g not in ("male", "female"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Укажите пол: мужской или женский",
        )


def _apply_profile_fields(profile: Profile, data: dict) -> None:
    if "name" in data:
        profile.name = data.get("name")
    if "gender" in data:
        profile.gender = data.get("gender")
    if "birth_date" in data:
        profile.birth_date = data.get("birth_date")
    if "city_name" in data:
        profile.city_name = data.get("city_name")
    if "latitude" in data:
        profile.latitude = data.get("latitude")
    if "longitude" in data:
        profile.longitude = data.get("longitude")
    if "bio" in data:
        profile.bio = data.get("bio")
    if "dm_privacy" in data:
        v = str(data.get("dm_privacy") or "all").strip()
        if v not in ("all", "acquaintances", "nobody"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="dm_privacy: допустимо all, acquaintances или nobody",
            )
        profile.dm_privacy = v
    if "match_personality_weight" in data or "match_interests_weight" in data:
        mp = data.get("match_personality_weight", getattr(profile, "match_personality_weight", None))
        mi = data.get("match_interests_weight", getattr(profile, "match_interests_weight", None))
        try:
            a = float(mp) if mp is not None else 0.7
            b = float(mi) if mi is not None else 0.3
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Некорректные значения весов подбора",
            )
        s = a + b
        if s <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Сумма весов должна быть больше нуля",
            )
        a, b = a / s, b / s
        if a < 0.05 or b < 0.05 or a > 0.95 or b > 0.95:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Каждый вес должен быть в диапазоне от 5% до 95%",
            )
        profile.match_personality_weight = a
        profile.match_interests_weight = b


def _assert_locked_demographics_unchanged(profile: Profile, data: dict) -> None:
    """Пол и дата рождения после первого заполнения не меняются."""
    if "gender" in data:
        cur = profile.gender
        if cur in ("male", "female"):
            incoming = data.get("gender")
            if incoming is not None and incoming != cur:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Пол был указан при заполнении анкеты и не может быть изменён.",
                )
    if "birth_date" in data:
        cur = profile.birth_date
        if cur and str(cur).strip():
            incoming = data.get("birth_date")
            if incoming is not None and str(incoming).strip() != str(cur).strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Дата рождения была указана при заполнении анкеты и не может быть изменена.",
                )


@router.get("/interests")
def list_interests(db: Session = Depends(get_db)):
    rows = db.query(Interest).order_by(Interest.sort_order, Interest.id).all()
    return [
        {"id": r.id, "slug": r.slug, "label_ru": r.label_ru, "icon": r.icon}
        for r in rows
    ]


@router.get("/geo/city-suggest")
def geo_city_suggest(
    q: str = "",
    _user_id: int = Depends(get_current_user_id),
):
    """
    Подсказки городов и населённых пунктов РФ через DaData (Suggest API).
    На сервисе profiles должны быть заданы переменные DADATA_API_KEY (и при необходимости DADATA_SECRET_KEY).
    Нужен JWT как защита от злоупотреблений.
    """
    text = (q or "").strip()
    if not text:
        return []
    try:
        return suggest_russian_cities(text)
    except GeoSuggestNotConfigured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Подсказки городов недоступны: задайте ключ API DaData в переменной окружения DADATA_API_KEY для сервиса profiles.",
        )
    except GeoSuggestAuthError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Подсказки городов: ключ DaData отклонён. Проверьте DADATA_API_KEY и при необходимости DADATA_SECRET_KEY.",
        )
    except GeoSuggestRateLimited:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сервис подсказок перегружен. Подождите несколько секунд и попробуйте снова.",
        )


@router.post("/profiles")
def create_profile(
    data: dict,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _reject_manual_big_five(data)
    _validate_gender_value(data)
    if data.get("bio") is not None and len(str(data.get("bio") or "")) > 4000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Текст в разделе «О себе» не может быть длиннее 4000 символов.",
        )
    existing = db.query(Profile).filter(Profile.user_id == user_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Профиль для этого пользователя уже существует",
        )
    profile = Profile(user_id=user_id)
    _apply_profile_fields(profile, data)
    profile.interests = json.dumps([])
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


@router.patch("/profiles/me")
def patch_my_profile(
    data: dict,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _reject_manual_big_five(data)
    _validate_gender_value(data)
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль не найден",
        )
    _assert_locked_demographics_unchanged(profile, data)
    if "bio" in data and data.get("bio") is not None:
        raw = str(data.get("bio") or "")
        if len(raw) > 4000:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Текст в разделе «О себе» не может быть длиннее 4000 символов.",
            )
    _apply_profile_fields(profile, data)
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


def _coerce_questionnaire_answers(raw: dict, codes: frozenset[str]) -> dict[str, int]:
    if frozenset(raw.keys()) != codes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нужен ровно один ответ (1–5) на каждый вопрос анкеты, без лишних полей.",
        )
    out: dict[str, int] = {}
    for code in codes:
        v = raw.get(code)
        try:
            iv = int(v)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Некорректный ответ для {code}",
            )
        if iv < 1 or iv > 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ответ для {code} должен быть от 1 до 5",
            )
        out[code] = iv
    return out


@router.post("/profiles/me/questionnaire/short")
def submit_short_questionnaire(
    body: QuestionnaireAnswersBody,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль не найден")
    answers = _coerce_questionnaire_answers(body.answers, FAST_CODES)
    try:
        vec = score_from_answers(answers, FAST_QUESTIONS)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    profile.big_five_short_json = json.dumps(answers, ensure_ascii=False, sort_keys=True)
    if getattr(profile, "big_five_source", None) != "long":
        apply_vector_to_profile(profile, vec)
        profile.big_five_source = "short"
    profile.big_five_recomputed_at = _iso_now()
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


@router.post("/profiles/me/questionnaire/long")
def submit_long_questionnaire(
    body: QuestionnaireAnswersBody,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль не найден")
    answers = _coerce_questionnaire_answers(body.answers, LONG_CODES)
    try:
        vec = score_from_answers(answers, LONG_QUESTIONS)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    profile.big_five_long_json = json.dumps(answers, ensure_ascii=False, sort_keys=True)
    apply_vector_to_profile(profile, vec)
    profile.big_five_source = "long"
    profile.big_five_recomputed_at = _iso_now()
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


@router.post("/profiles/me/questionnaire/reset")
def reset_questionnaire(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль не найден")
    profile.big_five_short_json = "{}"
    profile.big_five_long_json = "{}"
    profile.big_five_source = None
    profile.big_five_recomputed_at = None
    profile.openness = None
    profile.conscientiousness = None
    profile.extraversion = None
    profile.agreeableness = None
    profile.neuroticism = None
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


@router.post("/profiles/me/dm-blocks/{blocked_profile_id}")
def block_dm_user(
    blocked_profile_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль не найден")
    me_id = int(profile.id)
    if int(blocked_profile_id) == me_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя заблокировать себя")
    other = db.query(Profile).filter(Profile.id == int(blocked_profile_id)).first()
    if not other:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    cur = _dm_blocked_ids_list(profile)
    if int(blocked_profile_id) not in cur:
        cur.append(int(blocked_profile_id))
    _set_dm_blocked_ids(profile, cur)
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


@router.delete("/profiles/me/dm-blocks/{blocked_profile_id}")
def unblock_dm_user(
    blocked_profile_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль не найден")
    cur = [x for x in _dm_blocked_ids_list(profile) if x != int(blocked_profile_id)]
    _set_dm_blocked_ids(profile, cur)
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


@router.put("/profiles/me/interests")
def put_my_interests(
    body: InterestsPutBody,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сначала создайте профиль",
        )
    ids = list(dict.fromkeys(body.interest_ids))
    if len(ids) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Выберите не менее 5 интересов",
        )
    if len(ids) > 30:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Можно выбрать не более 30 интересов",
        )
    if ids:
        found = db.query(Interest).filter(Interest.id.in_(ids)).count()
        if found != len(ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="В списке есть неизвестные интересы",
            )
    db.query(ProfileInterest).filter(ProfileInterest.profile_id == profile.id).delete(
        synchronize_session=False
    )
    for iid in ids:
        db.add(ProfileInterest(profile_id=profile.id, interest_id=iid))
    _sync_interests_json(db, profile)
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


@router.post("/profiles/me/avatar")
async def upload_my_avatar(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сначала создайте профиль",
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл пустой",
        )
    try:
        url = save_user_avatar(user_id, raw, file.content_type)
    except ValueError as exc:
        code = str(exc)
        if code == "unsupported_mime":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Используйте изображение JPEG, PNG или WebP",
            ) from exc
        if code == "too_large":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Файл больше 3 МБ",
            ) from exc
        if code == "empty_file":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Файл повреждён или слишком маленький",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не удалось сохранить файл",
        ) from exc
    profile.avatar_url = url
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


@router.delete("/profiles/me/avatar")
def delete_my_avatar(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль не найден",
        )
    delete_user_files(user_id)
    profile.avatar_url = None
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


_GALLERY_ID_RE = re.compile(r"^[0-9a-f]{32}$")


@router.post("/profiles/me/gallery")
async def upload_my_gallery_media(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сначала создайте профиль",
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл пустой",
        )
    existing = _gallery_list_from_profile(profile)
    try:
        item = add_gallery_item(user_id, existing, raw, file.content_type)
    except ValueError as exc:
        code = str(exc)
        if code == "unsupported_mime":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Поддерживаются изображения (JPEG, PNG, WebP, GIF) и видео MP4 или WebM",
            ) from exc
        if code == "too_large":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Файл слишком большой (не более 50 МБ)",
            ) from exc
        if code == "empty_file":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Файл повреждён или слишком маленький",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не удалось сохранить файл",
        ) from exc
    new_list = [item] + existing
    profile.gallery_json = _gallery_dump(new_list)
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


@router.delete("/profiles/me/gallery/{media_id}")
def delete_my_gallery_media(
    media_id: str,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if not media_id or not _GALLERY_ID_RE.match(media_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректный идентификатор файла",
        )
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль не найден",
        )
    existing = _gallery_list_from_profile(profile)
    new_list = [x for x in existing if str(x.get("id")) != media_id]
    if len(new_list) == len(existing):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Файл не найден",
        )
    delete_gallery_file(user_id, media_id)
    profile.gallery_json = _gallery_dump(new_list)
    db.commit()
    db.refresh(profile)
    return _profile_to_dict(db, profile, include_private=True)


@router.get("/profiles/me")
def get_my_profile(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль не найден. Заполните анкету.",
        )
    return _profile_to_dict(db, profile, include_private=True)


@router.get("/profiles/{profile_id}")
def get_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    x_service_token: str | None = Header(None, alias="X-Service-Token"),
):
    """Публичная карточка без черт; полный JSON — только с валидным X-Service-Token (match-сервис)."""
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        return {"error": "not found"}
    internal = (os.environ.get("INTERNAL_PROFILE_TOKEN") or "").strip()
    internal_ok = bool(internal and x_service_token == internal)
    data = _profile_to_dict(db, profile, include_private=internal_ok)
    if not internal_ok:
        data.pop("personality", None)
        data.pop("dm_privacy", None)
        data.pop("match_personality_weight", None)
        data.pop("match_interests_weight", None)
    return data
