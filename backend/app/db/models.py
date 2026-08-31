"""Persistence models.

Phase 1 only needs to persist finished games as PGN, but the SavedGame table
already carries the fields future phases will need (per-move engine eval
will live in a separate table once Phase 2 adds analysis, to avoid bloating
this one).
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class SavedGame(Base):
    __tablename__ = "saved_games"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    pgn: Mapped[str] = mapped_column(Text, nullable=False)
    initial_fen: Mapped[str] = mapped_column(String(128), nullable=False)
    result: Mapped[str] = mapped_column(String(8), nullable=False)
    human_color: Mapped[str] = mapped_column(String(8), nullable=False)
    ai_elo: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    ply_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    white_time_used_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    black_time_used_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc)
    )
