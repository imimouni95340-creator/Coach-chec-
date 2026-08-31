import chess
import pytest

from app.game import service
from app.game.models import GameSession, GameStatus, PlayerColor


def _play_sequence(session: GameSession, uci_moves: list[str]):
    last = None
    for uci in uci_moves:
        last = service.apply_human_move(session, uci)
    return last


def test_fools_mate_is_detected_as_checkmate():
    session = GameSession.new(PlayerColor.WHITE, 1300)
    last = _play_sequence(session, ["f2f3", "e7e5", "g2g4", "d8h4"])
    assert last.is_checkmate is True
    assert last.is_check is True
    assert session.status is GameStatus.CHECKMATE
    assert session.is_game_over is True
    assert session.result_string() == "0-1"  # black mates, white loses


def test_castling_kingside_is_detected():
    session = GameSession.new(PlayerColor.WHITE, 1300)
    moves = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "e1g1"]
    last = _play_sequence(session, moves)
    assert last.is_castling is True
    assert session.board.piece_at(chess.F1).piece_type == chess.ROOK
    assert session.board.piece_at(chess.G1).piece_type == chess.KING


def test_en_passant_capture_is_detected():
    session = GameSession.new(PlayerColor.WHITE, 1300)
    moves = ["e2e4", "a7a6", "e4e5", "d7d5", "e5d6"]
    last = _play_sequence(session, moves)
    assert last.is_en_passant is True
    assert last.is_capture is True
    # the captured black pawn (on d5) must be gone, and white pawn now on d6
    assert session.board.piece_at(chess.D5) is None
    assert session.board.piece_at(chess.D6).color == chess.WHITE


def test_promotion_to_queen_is_detected():
    session = GameSession.new(PlayerColor.WHITE, 1300)
    session.board = chess.Board("8/4P3/8/8/4k3/8/8/4K3 w - - 0 1")
    last = service.apply_human_move(session, "e7e8q")
    assert last.is_promotion is True
    assert last.promotion_piece == "queen"
    assert session.board.piece_at(chess.E8).piece_type == chess.QUEEN


def test_stalemate_is_detected_as_draw_not_checkmate():
    session = GameSession.new(PlayerColor.WHITE, 1300)
    # White king f6, White queen f7, Black king h8. Qf7-g7? would be check;
    # instead approach the stalemate with black to move already stalemated.
    session.board = chess.Board("7k/5Q2/5K2/8/8/8/8/8 b - - 0 1")
    assert session.board.is_stalemate()
    assert service.compute_status(session.board) is GameStatus.STALEMATE


def test_insufficient_material_is_a_draw():
    board = chess.Board("8/8/8/8/8/k7/8/K7 w - - 0 1")
    assert service.compute_status(board) is GameStatus.DRAW_INSUFFICIENT_MATERIAL


def test_fifty_move_rule_is_a_draw():
    board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 100 60")
    assert service.compute_status(board) is GameStatus.DRAW_FIFTY_MOVES


def test_check_without_mate_does_not_end_the_game():
    session = GameSession.new(PlayerColor.WHITE, 1300)
    session.board = chess.Board("4k3/8/8/8/7R/8/8/4K3 w - - 0 1")
    last = service.apply_human_move(session, "h4h8")
    assert last.is_check is True
    assert last.is_checkmate is False
    assert session.is_game_over is False


def test_illegal_move_is_rejected():
    session = GameSession.new(PlayerColor.WHITE, 1300)
    with pytest.raises(service.IllegalMoveError):
        service.apply_human_move(session, "e2e5")  # pawn can't jump 3 squares


def test_cannot_move_after_game_over():
    session = GameSession.new(PlayerColor.WHITE, 1300)
    _play_sequence(session, ["f2f3", "e7e5", "g2g4", "d8h4"])
    assert session.is_game_over is True
    with pytest.raises(service.GameAlreadyOverError):
        service.apply_human_move(session, "e2e4")


def test_resign_ends_game_with_correct_result():
    session = GameSession.new(PlayerColor.WHITE, 1300)
    service.resign(session, PlayerColor.WHITE)
    assert session.status is GameStatus.RESIGNED
    assert session.result_string() == "0-1"


def test_pgn_contains_headers_and_moves():
    session = GameSession.new(PlayerColor.WHITE, 900)
    _play_sequence(session, ["e2e4", "e7e5", "g1f3"])
    pgn = session.to_pgn()
    assert "[White " in pgn or '[White "' in pgn
    assert "1. e4 e5 2. Nf3" in pgn.replace("\n", " ")
