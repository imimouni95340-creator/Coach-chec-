/**
 * Rules, game state and PGN — the client-side counterpart of
 * `backend/app/game/`. Uses chess.js as the rules authority.
 *
 * Knows nothing about Stockfish or about the UI: it only answers "is this move
 * legal, what does the position look like now, and is the game over?".
 */
import { Chess } from "chess.js";
import type { GameStatus, MoveOut, PlayerColor } from "../types/game";

export class IllegalMoveError extends Error {}
export class GameAlreadyOverError extends Error {}

const PROMOTION_NAMES: Record<string, string> = {
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
};

export class GameSession {
  readonly id: string;
  readonly humanColor: PlayerColor;
  readonly aiElo: number;
  readonly createdAt: Date;

  private chess: Chess;
  /** Position the game started from — the standard start unless overridden. */
  readonly startingFen: string;
  moves: MoveOut[] = [];
  status: GameStatus = "in_progress";
  whiteTimeUsedMs = 0;
  blackTimeUsedMs = 0;
  private resignedBy: PlayerColor | null = null;

  constructor(
    humanColor: PlayerColor,
    aiElo: number,
    options: { id?: string; createdAt?: Date; startingFen?: string } = {},
  ) {
    this.humanColor = humanColor;
    this.aiElo = aiElo;
    this.id = options.id ?? crypto.randomUUID();
    this.createdAt = options.createdAt ?? new Date();
    // A custom starting position also lets later phases replay a puzzle or an
    // exercise built from one of the player's own mistakes.
    this.chess = options.startingFen ? new Chess(options.startingFen) : new Chess();
    this.startingFen = this.chess.fen();
  }

  get aiColor(): PlayerColor {
    return this.humanColor === "white" ? "black" : "white";
  }

  get sideToMove(): PlayerColor {
    return this.chess.turn() === "w" ? "white" : "black";
  }

  get isGameOver(): boolean {
    return this.status !== "in_progress";
  }

  get fen(): string {
    return this.chess.fen();
  }

  /** Legal moves as UCI strings, which is what the board UI consumes. */
  legalMovesUci(): string[] {
    return this.chess
      .moves({ verbose: true })
      .map((m) => `${m.from}${m.to}${m.promotion ?? ""}`);
  }

  /** PGN-style result: 1-0, 0-1, 1/2-1/2, or * while in progress. */
  result(): string {
    if (this.status === "in_progress") return "*";
    if (this.status === "checkmate") {
      // The side that just moved delivered mate; the side to move now lost.
      return this.chess.turn() === "w" ? "0-1" : "1-0";
    }
    if (this.status === "resigned") {
      return this.resignedBy === "white" ? "0-1" : "1-0";
    }
    return "1/2-1/2";
  }

  private computeStatus(): GameStatus {
    if (this.chess.isCheckmate()) return "checkmate";
    if (this.chess.isStalemate()) return "stalemate";
    if (this.chess.isInsufficientMaterial()) return "draw_insufficient_material";
    if (this.chess.isThreefoldRepetition()) return "draw_threefold_repetition";
    // chess.js reports the 50-move rule through isDraw() once the halfmove
    // clock reaches 100; the more specific cases are already handled above.
    if (this.chess.isDraw()) return "draw_fifty_moves";
    return "in_progress";
  }

  /** Applies a move given in UCI form (e.g. "e2e4", "e7e8q"). */
  applyMove(uci: string, thinkingTimeMs: number | null): MoveOut {
    if (this.isGameOver) throw new GameAlreadyOverError("This game has already ended.");

    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const color = this.sideToMove;

    let move;
    try {
      move = this.chess.move({ from, to, promotion });
    } catch {
      throw new IllegalMoveError(`Move '${uci}' is not legal in the current position.`);
    }
    if (!move) throw new IllegalMoveError(`Move '${uci}' is not legal in the current position.`);

    const record: MoveOut = {
      ply: this.moves.length + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      color,
      // chess.js flags: k/q castling, e en passant, p promotion, c capture
      is_check: this.chess.isCheck(),
      is_checkmate: this.chess.isCheckmate(),
      is_castling: move.flags.includes("k") || move.flags.includes("q"),
      is_en_passant: move.flags.includes("e"),
      is_promotion: Boolean(move.promotion),
      promotion_piece: move.promotion ? PROMOTION_NAMES[move.promotion] ?? null : null,
      is_capture: move.flags.includes("c") || move.flags.includes("e"),
      thinking_time_ms: thinkingTimeMs,
    };

    this.moves.push(record);
    this.status = this.computeStatus();

    if (thinkingTimeMs != null) {
      if (color === "white") this.whiteTimeUsedMs += thinkingTimeMs;
      else this.blackTimeUsedMs += thinkingTimeMs;
    }

    return record;
  }

  resign(resigningColor: PlayerColor): void {
    if (this.isGameOver) throw new GameAlreadyOverError("This game has already ended.");
    this.status = "resigned";
    this.resignedBy = resigningColor;
  }

  /** Full PGN with headers, for saving and for later analysis phases. */
  toPgn(): string {
    const isCustomStart = this.startingFen !== new Chess().fen();
    const replay = isCustomStart ? new Chess(this.startingFen) : new Chess();
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = this.createdAt;

    if (isCustomStart) {
      // Required by the PGN spec so the move list can be replayed correctly.
      replay.header("SetUp", "1");
      replay.header("FEN", this.startingFen);
    }

    replay.header("Event", "Coach d'Echecs IA - Phase 1");
    replay.header("Site", "Appareil local");
    replay.header("Date", `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`);
    replay.header("Round", "1");
    replay.header("White", this.humanColor === "white" ? "Human" : `Stockfish (${this.aiElo} Elo)`);
    replay.header("Black", this.humanColor === "black" ? "Human" : `Stockfish (${this.aiElo} Elo)`);
    replay.header("Result", this.result());

    for (const record of this.moves) replay.move(record.san);
    return replay.pgn();
  }
}
