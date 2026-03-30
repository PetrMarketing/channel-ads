import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    DATABASE_SSL: bool = os.getenv("DATABASE_SSL", "false").lower() == "true"
    JWT_SECRET: str = os.getenv("JWT_SECRET", "change-me")
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "") or os.getenv("BOT_TOKEN", "")
    MAX_BOT_TOKEN: str = os.getenv("MAX_BOT_TOKEN", "")
    BOT_USERNAME: str = os.getenv("BOT_USERNAME", "")
    MAX_BOT_USERNAME: str = os.getenv("MAX_BOT_USERNAME", "")
    APP_URL: str = os.getenv("APP_URL", "http://localhost:8000")
    PORT: int = int(os.getenv("PORT", "8000"))
    TINKOFF_TERMINAL_KEY: str = os.getenv("TINKOFF_TERMINAL_KEY", "")
    TINKOFF_PASSWORD: str = os.getenv("TINKOFF_PASSWORD", "")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    YM_OAUTH_TOKEN: str = os.getenv("YM_OAUTH_TOKEN", "")
    ADMIN_JWT_SECRET: str = os.getenv("ADMIN_JWT_SECRET", "admin-secret-change-me")
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads"))


settings = Settings()
