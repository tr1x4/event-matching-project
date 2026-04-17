from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.requests import Request
from starlette.staticfiles import StaticFiles

from app.api.routes import router
from app.db.database import Base, engine
from app.storage_paths import avatar_storage_dir, profile_gallery_storage_dir
from app.db.migrate import run_sqlite_migrations
from app.models import interest as interest_model  # noqa: F401
from app.models import profile  # noqa: F401

app = FastAPI(title="Profiles service")


@app.exception_handler(RequestValidationError)
async def validation_errors_ru(_request: Request, _exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "Проверьте введённые данные в форме."},
    )


Base.metadata.create_all(bind=engine)
run_sqlite_migrations()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:8080",
        "http://localhost:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

_avatar_dir = avatar_storage_dir()
_avatar_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/media/avatars",
    StaticFiles(directory=str(_avatar_dir)),
    name="avatar_media",
)

_gallery_dir = profile_gallery_storage_dir()
_gallery_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/media/profile-gallery",
    StaticFiles(directory=str(_gallery_dir)),
    name="profile_gallery_media",
)


@app.get("/")
def root():
    return {"status": "profiles service running"}
