from jose import JWTError, jwt

from app.core.config import settings


def decode_user_id(token: str) -> int | None:
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        typ = data.get("typ")
        if typ == "refresh":
            return None
        if typ not in (None, "access"):
            return None
        sub = data.get("sub")
        if sub is None:
            return None
        return int(sub)
    except (JWTError, ValueError):
        return None
