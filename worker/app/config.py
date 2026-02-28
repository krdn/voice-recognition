# worker/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://voice:voice_secret@localhost:5437/voice_recognition"
    redis_url: str = "redis://localhost:6382/0"
    upload_dir: str = "./uploads"
    ollama_url: str = "http://localhost:11434"
    hf_token: str = ""
    whisper_model: str = "medium"
    whisper_compute_type: str = "float16"
    whisper_batch_size: int = 8
    ollama_model: str = "llama3.2"

    model_config = {"env_file": ".env"}


settings = Settings()
