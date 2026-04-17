from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

TYP_ACCESS = "access"
TYP_REFRESH = "refresh"


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")
    if len(raw) > 72:
        raw = raw[:72]
    hashed = bcrypt.hashpw(raw, bcrypt.gensalt(rounds=12))
    return hashed.decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        raw = plain.encode("utf-8")
        if len(raw) > 72:
            raw = raw[:72]
        return bcrypt.checkpw(raw, hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {"sub": subject, "exp": expire, "typ": TYP_ACCESS}
    return jwt.encode(
        payload, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
    )
    payload = {"sub": subject, "exp": expire, "typ": TYP_REFRESH}
    return jwt.encode(
        payload, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )


def decode_access_token(token: str) -> str | None:
    """Только access JWT (sub = user id). Refresh сюда не подставлять."""
    try:
        data = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        typ = data.get("typ")
        if typ == TYP_REFRESH:
            return None
        if typ not in (None, TYP_ACCESS):
            return None
        sub = data.get("sub")
        return str(sub) if sub is not None else None
    except JWTError:
        return None


def decode_refresh_token(token: str) -> str | None:
    try:
        data = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        if data.get("typ") != TYP_REFRESH:
            return None
        sub = data.get("sub")
        return str(sub) if sub is not None else None
    except JWTError:
        return None
