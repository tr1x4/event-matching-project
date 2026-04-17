from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    jwt_secret: str = "dev-change-me-in-production-use-long-random-string"
    jwt_algorithm: str = "HS256"
    profiles_service_url: str = "http://127.0.0.1:8001"


settings = Settings()
