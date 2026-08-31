/**
 * The application's game API — implemented entirely on the device.
 *
 * It deliberately mirrors the shape of the old HTTP client (`api.createGame`,
 * `api.makeMove`, ...) so the UI components stay unaware of where the engine
 * runs. The difference is that nothing here touches the network: rules come
 * from chess.js, moves come from Stockfish compiled to WebAssembly, and
 * finished games are archived in on-device storage.
 */
import { StockfishEngine } from "../engine/stockfishEngine";
import { AVAILABLE_ELO_LEVELS } from "../engine/difficulty";
import type { DifficultyLevelOut, GameStateOut, PlayerColor } from "../types/game";
import { GameAlreadyOverError, GameSession, IllegalMoveError } from "./gameSession";
import { saveFinishedGame } from "./storage";

/** The engine boots once and is reused across games (startup costs ~1s). */
let engineInstance: StockfishEngine | null = null;

function getEngine(): StockfishEngine {
  if (!engineInstance) engineInstance = new StockfishEngine();
  return engineInstance;
}

/** Starts loading the engine early, so the first move isn't delayed. */
export function warmUpEngine(): void {
  try {
    void getEngine().ready();
  } catch {
    // Surfaced later, when a move is actually requested.
  }
}

const sessions = new Map<string, GameSession>();

function toState(session: GameSession): GameStateOut {
  return {
    id: session.id,
    fen: session.fen,
    human_color: session.humanColor,
    ai_color: session.aiColor,
    ai_elo: session.aiElo,
    side_to_move: session.sideToMove,
    status: session.status,
    is_game_over: session.isGameOver,
    result: session.result(),
    moves: session.moves,
    legal_moves: session.legalMovesUci(),
    white_time_used_ms: session.whiteTimeUsedMs,
    black_time_used_ms: session.blackTimeUsedMs,
  };
}

function requireSession(gameId: string): GameSession {
  const session = sessions.get(gameId);
  if (!session) throw new Error("Partie introuvable.");
  return session;
}

function archiveIfOver(session: GameSession): void {
  if (session.isGameOver) saveFinishedGame(session);
}

export const api = {
  getDifficultyLevels: async (): Promise<DifficultyLevelOut[]> =>
    AVAILABLE_ELO_LEVELS.map((elo) => ({ target_elo: elo, label: `${elo} Elo` })),

  createGame: async (humanColor: PlayerColor, aiElo: number): Promise<GameStateOut> => {
    if (!AVAILABLE_ELO_LEVELS.includes(aiElo)) {
      throw new Error(`Niveau inconnu : ${aiElo}`);
    }
    const session = new GameSession(humanColor, aiElo);
    sessions.set(session.id, session);
    warmUpEngine();
    return toState(session);
  },

  getGame: async (gameId: string): Promise<GameStateOut> => toState(requireSession(gameId)),

  makeMove: async (gameId: string, uci: string): Promise<GameStateOut> => {
    const session = requireSession(gameId);
    session.applyMove(uci, null);
    archiveIfOver(session);
    return toState(session);
  },

  playAiMove: async (gameId: string): Promise<GameStateOut> => {
    const session = requireSession(gameId);
    if (session.isGameOver) throw new GameAlreadyOverError("La partie est terminée.");
    if (session.sideToMove !== session.aiColor) {
      throw new Error("Ce n'est pas au tour de l'IA de jouer.");
    }

    const result = await getEngine().bestMove(session.fen, session.aiElo);
    session.applyMove(result.uci, result.thinkingTimeMs);
    archiveIfOver(session);
    return toState(session);
  },

  resign: async (gameId: string, resigningColor: PlayerColor): Promise<GameStateOut> => {
    const session = requireSession(gameId);
    session.resign(resigningColor);
    archiveIfOver(session);
    return toState(session);
  },

  abandonGame: async (gameId: string): Promise<{ ok: boolean }> => {
    sessions.delete(gameId);
    return { ok: true };
  },
};

export { GameAlreadyOverError, IllegalMoveError };
