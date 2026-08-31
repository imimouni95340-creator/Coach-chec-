/**
 * On-device persistence of finished games (PGN + metadata).
 *
 * Replaces the SQLite table from the server version: everything stays on the
 * phone. Isolated behind this module so a later phase can move it to IndexedDB
 * (or sync it to the backend for analysis) without touching game logic.
 */
import type { GameSession } from "./gameSession";

const STORAGE_KEY = "coach-echecs.saved-games";

export interface SavedGame {
  id: string;
  pgn: string;
  initialFen: string;
  result: string;
  humanColor: string;
  aiElo: number;
  status: string;
  plyCount: number;
  whiteTimeUsedMs: number;
  blackTimeUsedMs: number;
  createdAt: string;
  finishedAt: string;
}

export function listSavedGames(): SavedGame[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedGame[]) : [];
  } catch {
    // Corrupted or unavailable storage must never break the game.
    return [];
  }
}

export function saveFinishedGame(session: GameSession): SavedGame {
  const saved: SavedGame = {
    id: session.id,
    pgn: session.toPgn(),
    initialFen: session.startingFen,
    result: session.result(),
    humanColor: session.humanColor,
    aiElo: session.aiElo,
    status: session.status,
    plyCount: session.moves.length,
    whiteTimeUsedMs: session.whiteTimeUsedMs,
    blackTimeUsedMs: session.blackTimeUsedMs,
    createdAt: session.createdAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };

  try {
    const games = listSavedGames().filter((g) => g.id !== saved.id);
    games.unshift(saved);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch {
    // Private browsing / storage full: the game is still playable, we just
    // could not archive it.
  }
  return saved;
}

export function getSavedGame(id: string): SavedGame | undefined {
  return listSavedGames().find((g) => g.id === id);
}

export function clearSavedGames(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
