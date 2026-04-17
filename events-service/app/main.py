from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.requests import Request
from starlette.staticfiles import StaticFiles

from app.api.routes import router
from app.db.database import Base, engine
from app.db.migrate import run_sqlite_migrations
from app.models import event  # noqa: F401
from app.models import event_category  # noqa: F401
from app.services.event_media_storage import EVENT_MEDIA_ROOT

app = FastAPI(title="Events service")


@app.exception_handler(RequestValidationError)
async def validation_errors_ru(_request: Request, _exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "Проверьте введённые данные в форме."},
    )


Base.metadata.create_all(bind=engine)
run_sqlite_migrations()

EVENT_MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

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
    "/media/events",
    StaticFiles(directory=str(EVENT_MEDIA_ROOT)),
    name="event_media",
)


@app.get("/")
def root():
    return {"status": "events service running"}
