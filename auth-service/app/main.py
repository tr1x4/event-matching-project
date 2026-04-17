from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.requests import Request

from app.api.routes import router
from app.db.database import Base, engine
from app.models import user as user_model  # noqa: F401

app = FastAPI(title="Auth service")


@app.exception_handler(RequestValidationError)
async def validation_errors_ru(_request: Request, _exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "Проверьте введённые данные в форме."},
    )


Base.metadata.create_all(bind=engine)

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


@app.get("/")
def root():
    return {"status": "auth service running"}
