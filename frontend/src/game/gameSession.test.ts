import { describe, expect, it } from "vitest";
import { GameAlreadyOverError, GameSession, IllegalMoveError } from "./gameSession";

function play(session: GameSession, moves: string[]) {
  let last;
  for (const uci of moves) last = session.applyMove(uci, null);
  return last!;
}

function newGame(startingFen?: string) {
  return new GameSession("white", 1300, { startingFen });
}

describe("game over detection", () => {
  it("detects fool's mate as checkmate", () => {
    const session = newGame();
    const last = play(session, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(last.is_checkmate).toBe(true);
    expect(last.is_check).toBe(true);
    expect(session.status).toBe("checkmate");
    expect(session.isGameOver).toBe(true);
    expect(session.result()).toBe("0-1"); // black mates, white loses
  });

  it("detects stalemate as a draw, not a checkmate", () => {
    // Black king g8, white king g6, white queen f7. Qf6 leaves black with no
    // legal move and no check: stalemate.
    const session = newGame("6k1/5Q2/6K1/8/8/8/8/8 w - - 0 1");
    const last = session.applyMove("f7f6", null);
    expect(last.is_check).toBe(false);
    expect(session.status).toBe("stalemate");
    expect(session.result()).toBe("1/2-1/2");
  });

  it("detects insufficient material as a draw", () => {
    // Black king captures white's last rook, leaving king versus king.
    const session = newGame("8/8/8/8/8/kR6/8/K7 b - - 0 1");
    const last = session.applyMove("a3b3", null);
    expect(last.is_capture).toBe(true);
    expect(session.status).toBe("draw_insufficient_material");
    expect(session.result()).toBe("1/2-1/2");
  });

  it("detects the fifty-move rule", () => {
    // Halfmove clock at 99: the next quiet move reaches 100.
    const session = newGame("4k3/8/8/8/8/8/8/R3K3 w Q - 99 60");
    session.applyMove("a1b1", null);
    expect(session.status).toBe("draw_fifty_moves");
  });

  it("keeps the game running on a check that is not mate", () => {
    const session = newGame("4k3/8/8/8/7R/8/8/4K3 w - - 0 1");
    const last = session.applyMove("h4h8", null);
    expect(last.is_check).toBe(true);
    expect(last.is_checkmate).toBe(false);
    expect(session.isGameOver).toBe(false);
  });
});

describe("special moves", () => {
  it("detects kingside castling", () => {
    const session = newGame();
    const last = play(session, ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "e1g1"]);
    expect(last.is_castling).toBe(true);
    expect(last.san).toBe("O-O");
  });

  it("detects an en passant capture", () => {
    const session = newGame();
    const last = play(session, ["e2e4", "a7a6", "e4e5", "d7d5", "e5d6"]);
    expect(last.is_en_passant).toBe(true);
    expect(last.is_capture).toBe(true);
  });

  it("detects promotion and records the chosen piece", () => {
    const session = newGame("8/4P3/8/8/4k3/8/8/4K3 w - - 0 1");
    const last = session.applyMove("e7e8q", null);
    expect(last.is_promotion).toBe(true);
    expect(last.promotion_piece).toBe("queen");
    expect(last.san).toContain("=Q");
  });

  it("supports underpromotion to a knight", () => {
    const session = newGame("8/4P3/8/8/4k3/8/8/4K3 w - - 0 1");
    const last = session.applyMove("e7e8n", null);
    expect(last.promotion_piece).toBe("knight");
  });
});

describe("move validation", () => {
  it("rejects an illegal move", () => {
    const session = newGame();
    expect(() => session.applyMove("e2e5", null)).toThrow(IllegalMoveError);
  });

  it("rejects moves once the game is over", () => {
    const session = newGame();
    play(session, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(() => session.applyMove("e2e4", null)).toThrow(GameAlreadyOverError);
  });

  it("exposes legal moves in UCI form, including promotions", () => {
    const session = newGame("8/4P3/8/8/4k3/8/8/4K3 w - - 0 1");
    const legal = session.legalMovesUci();
    expect(legal).toContain("e7e8q");
    expect(legal).toContain("e7e8n");
  });
});

describe("resignation and clocks", () => {
  it("awards the win to the opponent on resignation", () => {
    const session = newGame();
    session.resign("white");
    expect(session.status).toBe("resigned");
    expect(session.result()).toBe("0-1");
  });

  it("accumulates thinking time per colour", () => {
    const session = newGame();
    session.applyMove("e2e4", 1200);
    session.applyMove("e7e5", 800);
    expect(session.whiteTimeUsedMs).toBe(1200);
    expect(session.blackTimeUsedMs).toBe(800);
  });
});

describe("PGN", () => {
  it("includes headers and the move list", () => {
    const session = new GameSession("white", 900, { createdAt: new Date(2026, 0, 15) });
    play(session, ["e2e4", "e7e5", "g1f3"]);
    const pgn = session.toPgn();
    expect(pgn).toContain('[White "Human"]');
    expect(pgn).toContain('[Black "Stockfish (900 Elo)"]');
    expect(pgn).toContain('[Date "2026.01.15"]');
    expect(pgn.replace(/\n/g, " ")).toContain("1. e4 e5 2. Nf3");
  });

  it("records the result of a finished game", () => {
    const session = newGame();
    play(session, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(session.toPgn()).toContain('[Result "0-1"]');
  });

  it("marks a custom starting position with SetUp and FEN headers", () => {
    const fen = "8/4P3/8/8/4k3/8/8/4K3 w - - 0 1";
    const session = newGame(fen);
    session.applyMove("e7e8q", null);
    const pgn = session.toPgn();
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${fen}"]`);
  });
});
