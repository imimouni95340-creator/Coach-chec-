"""Game logic: applying moves, detecting special rules and game-over conditions.

This is the only module allowed to mutate a GameSession's board. It knows
about python-chess rules but nothing about HTTP, Stockfish's internals, or
the database.
"""
from __future__ import annotations

import chess

from app.engine.stockfish_engine import StockfishEngine
from app.game.models import GameSession, GameStatus, MoveRecord, PlayerColor


class IllegalMoveError(ValueError):
    pass


class GameAlreadyOverError(ValueError):
    pass


def compute_status(board: chess.Board) -> GameStatus:
    outcome = board.outcome(claim_draw=True)
    if outcome is None:
        return GameStatus.IN_PROGRESS
    if outcome.termination is chess.Termination.CHECKMATE:
        return GameStatus.CHECKMATE
    if outcome.termination is chess.Termination.STALEMATE:
        return GameStatus.STALEMATE
    if outcome.termination is chess.Termination.INSUFFICIENT_MATERIAL:
        return GameStatus.DRAW_INSUFFICIENT_MATERIAL
    if outcome.termination in (
        chess.Termination.FIFTY_MOVES,
        chess.Termination.SEVENTYFIVE_MOVES,
    ):
        return GameStatus.DRAW_FIFTY_MOVES
    if outcome.termination in (
        chess.Termination.THREEFOLD_REPETITION,
        chess.Termination.FIVEFOLD_REPETITION,
    ):
        return GameStatus.DRAW_THREEFOLD_REPETITION
    return GameStatus.DRAW_INSUFFICIENT_MATERIAL  # fallback for any other draw termination


_PROMOTION_NAMES = {
    chess.QUEEN: "queen",
    chess.ROOK: "rook",
    chess.BISHOP: "bishop",
    chess.KNIGHT: "knight",
}


def _record_move(board: chess.Board, move: chess.Move, ply: int, color: PlayerColor,
                  thinking_time_ms: int | None) -> MoveRecord:
    """Build a MoveRecord. Must be called BEFORE the move is pushed (SAN needs the pre-move board)."""
    is_castling = board.is_castling(move)
    is_en_passant = board.is_en_passant(move)
    is_capture = board.is_capture(move)
    san = board.san(move)

    board.push(move)

    is_check = board.is_check()
    is_checkmate = board.is_checkmate()

    return MoveRecord(
        ply=ply,
        san=san,
        uci=move.uci(),
        color=color,
        is_check=is_check,
        is_checkmate=is_checkmate,
        is_castling=is_castling,
        is_en_passant=is_en_passant,
        is_promotion=move.promotion is not None,
        promotion_piece=_PROMOTION_NAMES.get(move.promotion) if move.promotion else None,
        is_capture=is_capture,
        thinking_time_ms=thinking_time_ms,
    )


def legal_moves_uci(session: GameSession) -> list[str]:
    return [m.uci() for m in session.board.legal_moves]


def apply_human_move(session: GameSession, uci_move: str) -> MoveRecord:
    if session.is_game_over:
        raise GameAlreadyOverError("This game has already ended.")

    board = session.board
    try:
        move = chess.Move.from_uci(uci_move)
    except ValueError as exc:
        raise IllegalMoveError(f"'{uci_move}' is not a valid UCI move.") from exc

    if move not in board.legal_moves:
        raise IllegalMoveError(f"Move '{uci_move}' is not legal in the current position.")

    color = session.side_to_move
    ply = len(session.moves) + 1
    record = _record_move(board, move, ply, color, thinking_time_ms=None)
    session.moves.append(record)
    session.status = compute_status(board)
    return record


def apply_engine_move(session: GameSession, engine: StockfishEngine) -> MoveRecord:
    if session.is_game_over:
        raise GameAlreadyOverError("This game has already ended.")

    board = session.board
    result = engine.best_move(board, session.ai_elo)
    color = session.side_to_move
    ply = len(session.moves) + 1
    record = _record_move(board, result.move, ply, color, thinking_time_ms=result.thinking_time_ms)
    session.moves.append(record)
    session.status = compute_status(board)

    if color is PlayerColor.WHITE:
        session.white_time_used_ms += result.thinking_time_ms
    else:
        session.black_time_used_ms += result.thinking_time_ms

    return record


def resign(session: GameSession, resigning_color: PlayerColor) -> None:
    if session.is_game_over:
        raise GameAlreadyOverError("This game has already ended.")
    session.status = GameStatus.RESIGNED
    session.resigned_by = resigning_color
