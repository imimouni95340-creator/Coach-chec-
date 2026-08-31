"""In-memory registry of active game sessions.

Phase 1 keeps active games in memory (a real multi-user deployment would move
this to a per-worker cache or a shared store, but that's out of scope here).
Finished games are persisted to the database (see app.db) as PGN records.

Each active game owns one Stockfish process for its whole lifetime, which
keeps engine configuration (Skill Level, UCI_Elo, ...) simple and avoids
cross-game contention.
"""
from __future__ import annotations

import threading

from app.engine.stockfish_engine import StockfishEngine
from app.game.models import GameSession, PlayerColor


class GameNotFoundError(KeyError):
    pass


class GameManager:
    def __init__(self) -> None:
        self._sessions: dict[str, GameSession] = {}
        self._engines: dict[str, StockfishEngine] = {}
        self._lock = threading.Lock()

    def create_game(self, human_color: PlayerColor, ai_elo: int) -> GameSession:
        session = GameSession.new(human_color=human_color, ai_elo=ai_elo)
        with self._lock:
            self._sessions[session.id] = session
            self._engines[session.id] = StockfishEngine()
        return session

    def get(self, game_id: str) -> GameSession:
        session = self._sessions.get(game_id)
        if session is None:
            raise GameNotFoundError(game_id)
        return session

    def get_engine(self, game_id: str) -> StockfishEngine:
        engine = self._engines.get(game_id)
        if engine is None:
            raise GameNotFoundError(game_id)
        return engine

    def discard(self, game_id: str) -> None:
        with self._lock:
            engine = self._engines.pop(game_id, None)
            self._sessions.pop(game_id, None)
        if engine is not None:
            engine.close()


# Process-wide singleton used by the API layer. Fine for a single-worker
# FastAPI/uvicorn dev deployment; a production deployment with multiple
# workers would need a shared store instead.
game_manager = GameManager()
