"""Pydantic request/response schemas for the HTTP API."""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.engine.difficulty import AVAILABLE_ELO_LEVELS
from app.game.models import GameStatus, PlayerColor


class NewGameRequest(BaseModel):
    human_color: PlayerColor
    ai_elo: int = Field(description=f"One of {AVAILABLE_ELO_LEVELS}")


class MoveRequest(BaseModel):
    uci: str = Field(description="Move in UCI format, e.g. 'e2e4' or 'e7e8q' for promotion")


class MoveOut(BaseModel):
    ply: int
    san: str
    uci: str
    color: PlayerColor
    is_check: bool
    is_checkmate: bool
    is_castling: bool
    is_en_passant: bool
    is_promotion: bool
    promotion_piece: str | None
    is_capture: bool
    thinking_time_ms: int | None


class GameStateOut(BaseModel):
    id: str
    fen: str
    human_color: PlayerColor
    ai_color: PlayerColor
    ai_elo: int
    side_to_move: PlayerColor
    status: GameStatus
    is_game_over: bool
    result: str
    moves: list[MoveOut]
    legal_moves: list[str]
    white_time_used_ms: int
    black_time_used_ms: int
    pgn: str | None = None


class ResignRequest(BaseModel):
    resigning_color: PlayerColor


class DifficultyLevelOut(BaseModel):
    target_elo: int
    label: str


class SavedGameOut(BaseModel):
    id: str
    result: str
    human_color: str
    ai_elo: int
    status: str
    ply_count: int
    pgn: str
    created_at: str
    finished_at: str

    model_config = {"from_attributes": True}
