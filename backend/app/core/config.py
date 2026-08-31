"""Application configuration, loaded from environment variables (.env supported)."""
from __future__ import annotations

import shutil
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_stockfish_path() -> str:
    """Best-effort autodetection of the Stockfish binary on the host."""
    found = shutil.which("stockfish")
    if found:
        return found
    for candidate in ("/usr/games/stockfish", "/usr/bin/stockfish", "/usr/local/bin/stockfish"):
        if shutil.which(candidate) or __import__("os").path.exists(candidate):
            return candidate
    return "stockfish"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="COACH_", extra="ignore")

    stockfish_path: str = _default_stockfish_path()

    # SQLite by default; swap for a Postgres DSN later without touching the rest
    # of the codebase (e.g. postgresql+psycopg://user:pass@host/dbname).
    database_url: str = "sqlite:///./chess_coach.db"

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Dev convenience: also accept any device on a private LAN (typically your
    # phone on the same Wi-Fi), on any port. Deliberately limited to private
    # address ranges — never a wildcard. Override / tighten this before
    # exposing the API on a public network.
    cors_origin_regex: str = (
        r"http://("
        r"localhost"
        r"|127\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r"|192\.168\.\d{1,3}\.\d{1,3}"
        r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
        r")(:\d+)?"
    )

    # Hard safety caps so a client can never make the engine spin forever.
    engine_max_movetime_ms: int = 5000
    engine_max_depth: int = 20


@lru_cache
def get_settings() -> Settings:
    return Settings()
