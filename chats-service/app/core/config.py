from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    jwt_secret: str = "dev-change-me-in-production-use-long-random-string"
    jwt_algorithm: str = "HS256"
    database_url: str = "sqlite:////data/chat.db"
    storage_path: str = "/data"
    profiles_service_url: str = "http://127.0.0.1:8001"
    events_service_url: str = "http://127.0.0.1:8002"
    # Docker/.env задают INTERNAL_CHAT_TOKEN — имя поля pydantic (internal_token) иначе не совпадёт.
    internal_token: str = Field(default="dev-internal-chat-token", validation_alias="INTERNAL_CHAT_TOKEN")
    internal_profile_token: str = "dev-internal-profile-token"


settings = Settings()
