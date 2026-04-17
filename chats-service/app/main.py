import json

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request

from app.api.routes import router
from app.core.security import decode_user_id
from app.db.database import Base, engine
from app.db.migrate import run_sqlite_migrations
import app.models.chat  # noqa: F401 — регистрация моделей в Base.metadata
from app.services.chat_attachments_storage import chat_files_root
from app.services.upstream import fetch_my_profile
from app.ws.hub import hub
from app.ws.inbox_hub import inbox_hub

app = FastAPI(title="Chat service")


@app.exception_handler(RequestValidationError)
async def validation_errors_ru(_request: Request, _exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "Проверьте введённые данные."},
    )


Base.metadata.create_all(bind=engine)
run_sqlite_migrations()

CHAT_FILES_ROOT = chat_files_root()
CHAT_FILES_ROOT.mkdir(parents=True, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://localhost:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

app.mount(
    "/media/chat-files",
    StaticFiles(directory=str(CHAT_FILES_ROOT)),
    name="chat_media",
)


@app.get("/")
def root():
    return {"status": "chat service running"}


@app.websocket("/ws/chats/{chat_id}")
async def chat_ws(chat_id: int, websocket: WebSocket, token: str = Query(...)):
    from app.db.database import SessionLocal
    from app.models.chat import Chat, ChatMember

    if not token.strip():
        await websocket.close(code=4401)
        return
    if decode_user_id(token) is None:
        await websocket.close(code=4401)
        return
    auth_header = f"Bearer {token.strip()}"
    pr = fetch_my_profile(auth_header)
    if not pr or not pr.get("id"):
        await websocket.close(code=4401)
        return
    pid = int(pr["id"])
    db = SessionLocal()
    try:
        ch = db.query(Chat).filter(Chat.id == chat_id).first()
        if not ch or ch.deleted_globally_at is not None:
            await websocket.close(code=4404)
            return
        m = (
            db.query(ChatMember)
            .filter(ChatMember.chat_id == chat_id, ChatMember.profile_id == pid)
            .first()
        )
        if not m:
            await websocket.close(code=4403)
            return
    finally:
        db.close()

    await hub.connect(chat_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict) and data.get("type") == "typing":
                await hub.broadcast(chat_id, {"type": "typing", "profile_id": pid})
    except WebSocketDisconnect:
        hub.disconnect(chat_id, websocket)


@app.websocket("/ws/inbox")
async def inbox_ws(websocket: WebSocket, token: str = Query(...)):
    if not token.strip():
        await websocket.close(code=4401)
        return
    if decode_user_id(token) is None:
        await websocket.close(code=4401)
        return
    auth_header = f"Bearer {token.strip()}"
    pr = fetch_my_profile(auth_header)
    if not pr or not pr.get("id"):
        await websocket.close(code=4401)
        return
    pid = int(pr["id"])
    await inbox_hub.connect(pid, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        inbox_hub.disconnect(pid, websocket)
