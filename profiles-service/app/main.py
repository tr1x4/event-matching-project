from fastapi import FastAPI
from app.db.database import Base, engine
from app.models import profile
from app.api.routes import router  # 👈 ВАЖНО

app = FastAPI()

# создаём таблицы
Base.metadata.create_all(bind=engine)

# 👇 ВАЖНО — подключаем routes
app.include_router(router)


@app.get("/")
def root():
    return {"status": "profiles service running"}