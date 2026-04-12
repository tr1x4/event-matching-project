from fastapi import FastAPI
from app.db.database import Base, engine
from app.models import event
from app.api.routes import router

app = FastAPI()

# создаём таблицы при запуске
Base.metadata.create_all(bind=engine)

# подключаем routes
app.include_router(router)


@app.get("/")
def root():
    return {"status": "events service running"}