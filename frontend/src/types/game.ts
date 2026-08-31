// Mirrors backend/app/api/schemas.py — keep in sync manually for Phase 1.

export type PlayerColor = "white" | "black";

export type GameStatus =
  | "in_progress"
  | "checkmate"
  | "stalemate"
  | "draw_insufficient_material"
  | "draw_fifty_moves"
  | "draw_threefold_repetition"
  | "resigned";

export interface MoveOut {
  ply: number;
  san: string;
  uci: string;
  color: PlayerColor;
  is_check: boolean;
  is_checkmate: boolean;
  is_castling: boolean;
  is_en_passant: boolean;
  is_promotion: boolean;
  promotion_piece: string | null;
  is_capture: boolean;
  thinking_time_ms: number | null;
}

export interface GameStateOut {
  id: string;
  fen: string;
  human_color: PlayerColor;
  ai_color: PlayerColor;
  ai_elo: number;
  side_to_move: PlayerColor;
  status: GameStatus;
  is_game_over: boolean;
  result: string;
  moves: MoveOut[];
  legal_moves: string[];
  white_time_used_ms: number;
  black_time_used_ms: number;
  pgn?: string | null;
}

export interface DifficultyLevelOut {
  target_elo: number;
  label: string;
}
