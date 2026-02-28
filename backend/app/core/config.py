# backend/app/core/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://voice:voice_secret@localhost:5437/voice_recognition"
    redis_url: str = "redis://localhost:6382/0"
    secret_key: str = "dev-secret-key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24시간
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 500
    service_api_key: str = ""

    model_config = {"env_file": ".env"}


settings = Settings()
