from fastapi import Depends, Header, HTTPException, status

from app.core.security import decode_user_id


def get_bearer_token(authorization: str | None = Header(None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация",
        )
    return authorization.split(" ", 1)[1].strip()


def get_current_user_id(token: str = Depends(get_bearer_token)) -> int:
    uid = decode_user_id(token)
    if uid is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный или просроченный токен",
        )
    return uid
