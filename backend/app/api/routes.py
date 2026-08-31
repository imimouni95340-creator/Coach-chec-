"""HTTP API. Thin layer: validates input, calls app.game / app.db, serializes output.

No chess rules and no Stockfish calls happen directly in this file.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import repository
from app.db.database import get_db
from app.engine.difficulty import AVAILABLE_ELO_LEVELS
from app.game import service
from app.game.manager import GameNotFoundError, game_manager
from app.game.models import GameSession
from app.api.schemas import (
    DifficultyLevelOut,
    GameStateOut,
    MoveOut,
    MoveRequest,
    NewGameRequest,
    ResignRequest,
    SavedGameOut,
)

router = APIRouter(prefix="/api")


def _to_move_out(record) -> MoveOut:
    return MoveOut(
        ply=record.ply,
        san=record.san,
        uci=record.uci,
        color=record.color,
        is_check=record.is_check,
        is_checkmate=record.is_checkmate,
        is_castling=record.is_castling,
        is_en_passant=record.is_en_passant,
        is_promotion=record.is_promotion,
        promotion_piece=record.promotion_piece,
        is_capture=record.is_capture,
        thinking_time_ms=record.thinking_time_ms,
    )


def _to_state_out(session: GameSession, include_pgn: bool = False) -> GameStateOut:
    return GameStateOut(
        id=session.id,
        fen=session.board.fen(),
        human_color=session.human_color,
        ai_color=session.ai_color,
        ai_elo=session.ai_elo,
        side_to_move=session.side_to_move,
        status=session.status,
        is_game_over=session.is_game_over,
        result=session.result_string(),
        moves=[_to_move_out(m) for m in session.moves],
        legal_moves=service.legal_moves_uci(session),
        white_time_used_ms=session.white_time_used_ms,
        black_time_used_ms=session.black_time_used_ms,
        pgn=session.to_pgn() if include_pgn else None,
    )


def _get_session_or_404(game_id: str) -> GameSession:
    try:
        return game_manager.get(game_id)
    except GameNotFoundError:
        raise HTTPException(status_code=404, detail="Game not found")


def _persist_if_over(db: Session, session: GameSession) -> None:
    if session.is_game_over:
        repository.save_finished_game(db, session)


@router.get("/difficulty-levels", response_model=list[DifficultyLevelOut])
def get_difficulty_levels() -> list[DifficultyLevelOut]:
    return [DifficultyLevelOut(target_elo=elo, label=f"{elo} Elo") for elo in AVAILABLE_ELO_LEVELS]


@router.post("/games", response_model=GameStateOut)
def create_game(payload: NewGameRequest) -> GameStateOut:
    if payload.ai_elo not in AVAILABLE_ELO_LEVELS:
        raise HTTPException(
            status_code=422,
            detail=f"ai_elo must be one of {AVAILABLE_ELO_LEVELS}",
        )
    session = game_manager.create_game(human_color=payload.human_color, ai_elo=payload.ai_elo)
    return _to_state_out(session)


@router.get("/games/{game_id}", response_model=GameStateOut)
def get_game(game_id: str) -> GameStateOut:
    session = _get_session_or_404(game_id)
    return _to_state_out(session)


@router.post("/games/{game_id}/moves", response_model=GameStateOut)
def make_move(game_id: str, payload: MoveRequest, db: Session = Depends(get_db)) -> GameStateOut:
    session = _get_session_or_404(game_id)
    try:
        service.apply_human_move(session, payload.uci)
    except service.IllegalMoveError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except service.GameAlreadyOverError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    _persist_if_over(db, session)
    return _to_state_out(session)


@router.post("/games/{game_id}/ai-move", response_model=GameStateOut)
def play_ai_move(game_id: str, db: Session = Depends(get_db)) -> GameStateOut:
    session = _get_session_or_404(game_id)
    if session.side_to_move != session.ai_color:
        raise HTTPException(status_code=409, detail="It is not the AI's turn to move.")

    engine = game_manager.get_engine(game_id)
    try:
        service.apply_engine_move(session, engine)
    except service.GameAlreadyOverError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    _persist_if_over(db, session)
    return _to_state_out(session)


@router.post("/games/{game_id}/resign", response_model=GameStateOut)
def resign_game(game_id: str, payload: ResignRequest, db: Session = Depends(get_db)) -> GameStateOut:
    session = _get_session_or_404(game_id)
    try:
        service.resign(session, payload.resigning_color)
    except service.GameAlreadyOverError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    _persist_if_over(db, session)
    return _to_state_out(session)


@router.delete("/games/{game_id}")
def abandon_game(game_id: str) -> dict:
    game_manager.discard(game_id)
    return {"ok": True}


@router.get("/saved-games", response_model=list[SavedGameOut])
def list_saved_games(db: Session = Depends(get_db)) -> list:
    games = repository.list_saved_games(db)
    return [
        SavedGameOut(
            id=g.id,
            result=g.result,
            human_color=g.human_color,
            ai_elo=g.ai_elo,
            status=g.status,
            ply_count=g.ply_count,
            pgn=g.pgn,
            created_at=g.created_at.isoformat(),
            finished_at=g.finished_at.isoformat(),
        )
        for g in games
    ]


@router.get("/saved-games/{game_id}", response_model=SavedGameOut)
def get_saved_game(game_id: str, db: Session = Depends(get_db)) -> SavedGameOut:
    g = repository.get_saved_game(db, game_id)
    if g is None:
        raise HTTPException(status_code=404, detail="Saved game not found")
    return SavedGameOut(
        id=g.id,
        result=g.result,
        human_color=g.human_color,
        ai_elo=g.ai_elo,
        status=g.status,
        ply_count=g.ply_count,
        pgn=g.pgn,
        created_at=g.created_at.isoformat(),
        finished_at=g.finished_at.isoformat(),
    )
