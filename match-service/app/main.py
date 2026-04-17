from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.services import event_derivatives
from app.services.profile_client import ProfileClientError, parse_profiles_error_detail


@asynccontextmanager
async def lifespan(_app: FastAPI):
    event_derivatives.start_worker_thread()
    yield
    event_derivatives.stop_worker_thread()


app = FastAPI(lifespan=lifespan)


@app.exception_handler(ProfileClientError)
async def profile_client_error_handler(_request: Request, exc: ProfileClientError) -> JSONResponse:
    """401/403/404 от profiles → тот же статус клиенту (чтобы SPA могла сделать refresh по 401)."""
    detail = parse_profiles_error_detail(exc.body) or "Ошибка сервиса профилей"
    if exc.status_code == 401:
        return JSONResponse(status_code=401, content={"detail": detail})
    if exc.status_code == 403:
        return JSONResponse(status_code=403, content={"detail": detail})
    if exc.status_code == 404:
        return JSONResponse(status_code=404, content={"detail": detail})
    if exc.status_code >= 500:
        return JSONResponse(
            status_code=502,
            content={"detail": "Сервис профилей временно недоступен"},
        )
    return JSONResponse(status_code=502, content={"detail": detail})


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:8080",
        "http://localhost:8080",
        "null",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {"status": "matching service running"}