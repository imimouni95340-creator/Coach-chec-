"""Thin wrapper around a real Stockfish process (via python-chess's UCI client).

This module is the ONLY place that talks to Stockfish. It knows nothing about
game history, PGN, or persistence — it only ever answers "given this
position, at this difficulty, what move should the engine play (or how good
is this position)". Game state and rules live in app.game, never here.
"""
from __future__ import annotations

import random
import time
from dataclasses import dataclass

import chess
import chess.engine

from app.core.config import get_settings
from app.engine.difficulty import DifficultyProfile, get_profile


@dataclass
class EngineMoveResult:
    move: chess.Move
    thinking_time_ms: int
    was_blunder: bool  # True if a deliberately sub-optimal move was chosen


class EngineUnavailableError(RuntimeError):
    """Raised when the Stockfish binary cannot be launched."""


class StockfishEngine:
    """Owns one Stockfish subprocess for the lifetime of the instance.

    Not thread-safe for concurrent `best_move` calls on the same instance;
    callers (e.g. the game service) should serialize access per game.
    """

    def __init__(self, stockfish_path: str | None = None) -> None:
        settings = get_settings()
        self._path = stockfish_path or settings.stockfish_path
        self._max_movetime_ms = settings.engine_max_movetime_ms
        self._max_depth = settings.engine_max_depth
        try:
            self._engine = chess.engine.SimpleEngine.popen_uci(self._path)
        except (FileNotFoundError, OSError) as exc:
            raise EngineUnavailableError(
                f"Could not start Stockfish at '{self._path}'. "
                "Install it (e.g. `apt-get install stockfish`) or set COACH_STOCKFISH_PATH."
            ) from exc

    def close(self) -> None:
        try:
            self._engine.quit()
        except Exception:
            pass

    def __enter__(self) -> "StockfishEngine":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    def best_move(self, board: chess.Board, target_elo: int) -> EngineMoveResult:
        """Return the engine's chosen move for `board`, calibrated to `target_elo`."""
        profile = get_profile(target_elo)
        self._configure(profile)

        limit_kwargs: dict = {}
        depth = min(profile.depth, self._max_depth) if profile.depth else None
        movetime_s = min(profile.movetime_ms, self._max_movetime_ms) / 1000.0
        if depth is not None:
            limit_kwargs["depth"] = depth
        limit_kwargs["time"] = movetime_s
        limit = chess.engine.Limit(**limit_kwargs)

        started = time.monotonic()

        use_blunder = (
            profile.blunder_probability > 0
            and random.random() < profile.blunder_probability
        )

        if use_blunder and profile.blunder_multipv > 1:
            legal_count = board.legal_moves.count()
            multipv = min(profile.blunder_multipv, max(legal_count, 1))
            info_list = self._engine.analyse(board, limit, multipv=multipv)
            candidates = [info["pv"][0] for info in info_list if info.get("pv")]
            move = random.choice(candidates) if candidates else self._engine.play(board, limit).move
            was_blunder = len(candidates) > 1
        else:
            result = self._engine.play(board, limit)
            move = result.move
            was_blunder = False

        elapsed_ms = int((time.monotonic() - started) * 1000)
        return EngineMoveResult(move=move, thinking_time_ms=elapsed_ms, was_blunder=was_blunder)

    def evaluate(self, board: chess.Board, depth: int = 12) -> chess.engine.PovScore:
        """Static evaluation of a position at full strength (used later for analysis)."""
        self._configure(get_profile(2100))
        info = self._engine.analyse(board, chess.engine.Limit(depth=depth))
        return info["score"]

    def _configure(self, profile: DifficultyProfile) -> None:
        options: dict[str, object] = {"Skill Level": profile.skill_level}
        if profile.use_uci_limit_strength and profile.uci_elo is not None:
            options["UCI_LimitStrength"] = True
            options["UCI_Elo"] = profile.uci_elo
        else:
            options["UCI_LimitStrength"] = False
        self._engine.configure(options)
