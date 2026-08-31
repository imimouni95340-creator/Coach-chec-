"""In-memory domain model for a single game in progress.

This module owns the rules/state of a chess game (via python-chess) and is
deliberately independent from both the Stockfish wrapper (app.engine) and
the HTTP layer (app.api). It is also independent from persistence (app.db) —
a GameSession only turns into a database row once the game ends.
"""
from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass, field
from enum import Enum

import chess
import chess.pgn


class PlayerColor(str, Enum):
    WHITE = "white"
    BLACK = "black"

    def to_chess_color(self) -> chess.Color:
        return chess.WHITE if self is PlayerColor.WHITE else chess.BLACK


class GameStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    CHECKMATE = "checkmate"
    STALEMATE = "stalemate"
    DRAW_INSUFFICIENT_MATERIAL = "draw_insufficient_material"
    DRAW_FIFTY_MOVES = "draw_fifty_moves"
    DRAW_THREEFOLD_REPETITION = "draw_threefold_repetition"
    RESIGNED = "resigned"


@dataclass
class MoveRecord:
    """One ply, enriched with the special-rule flags the UI needs to display."""

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
    thinking_time_ms: int | None  # None for instant/human moves we don't time


@dataclass
class GameSession:
    id: str
    human_color: PlayerColor
    ai_elo: int
    board: chess.Board = field(default_factory=chess.Board)
    moves: list[MoveRecord] = field(default_factory=list)
    status: GameStatus = GameStatus.IN_PROGRESS
    created_at: dt.datetime = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    white_time_used_ms: int = 0
    black_time_used_ms: int = 0
    resigned_by: PlayerColor | None = None

    @classmethod
    def new(cls, human_color: PlayerColor, ai_elo: int) -> "GameSession":
        return cls(id=str(uuid.uuid4()), human_color=human_color, ai_elo=ai_elo)

    @property
    def ai_color(self) -> PlayerColor:
        return PlayerColor.BLACK if self.human_color is PlayerColor.WHITE else PlayerColor.WHITE

    @property
    def side_to_move(self) -> PlayerColor:
        return PlayerColor.WHITE if self.board.turn == chess.WHITE else PlayerColor.BLACK

    @property
    def is_game_over(self) -> bool:
        return self.status is not GameStatus.IN_PROGRESS

    def result_string(self) -> str:
        """PGN-style result: 1-0, 0-1, 1/2-1/2, or * while in progress."""
        if self.status is GameStatus.IN_PROGRESS:
            return "*"
        if self.status is GameStatus.CHECKMATE:
            # The side that just moved delivered mate; the side to move now lost.
            return "0-1" if self.board.turn == chess.WHITE else "1-0"
        if self.status is GameStatus.RESIGNED:
            assert self.resigned_by is not None
            return "0-1" if self.resigned_by is PlayerColor.WHITE else "1-0"
        # Stalemate / draws
        return "1/2-1/2"

    def to_pgn(self) -> str:
        game = chess.pgn.Game()
        game.headers["Event"] = "Coach d'Echecs IA - Phase 1"
        game.headers["Site"] = "Local"
        game.headers["Date"] = self.created_at.strftime("%Y.%m.%d")
        game.headers["Round"] = "1"
        white = "Human" if self.human_color is PlayerColor.WHITE else f"Stockfish ({self.ai_elo} Elo)"
        black = "Human" if self.human_color is PlayerColor.BLACK else f"Stockfish ({self.ai_elo} Elo)"
        game.headers["White"] = white
        game.headers["Black"] = black
        game.headers["Result"] = self.result_string()

        node = game
        replay_board = chess.Board()
        for record in self.moves:
            move = replay_board.parse_san(record.san)
            node = node.add_variation(move)
            replay_board.push(move)

        exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
        return game.accept(exporter)
