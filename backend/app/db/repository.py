"""Persistence operations for finished games."""
from __future__ import annotations

import datetime as dt

import chess
from sqlalchemy.orm import Session

from app.db.models import SavedGame
from app.game.models import GameSession


def save_finished_game(db: Session, session: GameSession) -> SavedGame:
    saved = SavedGame(
        id=session.id,
        pgn=session.to_pgn(),
        initial_fen=chess.STARTING_FEN,
        result=session.result_string(),
        human_color=session.human_color.value,
        ai_elo=session.ai_elo,
        status=session.status.value,
        ply_count=len(session.moves),
        white_time_used_ms=session.white_time_used_ms,
        black_time_used_ms=session.black_time_used_ms,
        created_at=session.created_at,
        finished_at=dt.datetime.now(dt.timezone.utc),
    )
    db.merge(saved)
    db.commit()
    return saved


def list_saved_games(db: Session, limit: int = 50) -> list[SavedGame]:
    return (
        db.query(SavedGame)
        .order_by(SavedGame.finished_at.desc())
        .limit(limit)
        .all()
    )


def get_saved_game(db: Session, game_id: str) -> SavedGame | None:
    return db.get(SavedGame, game_id)
