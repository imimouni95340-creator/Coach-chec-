import type { DifficultyLevelOut, GameStateOut, PlayerColor } from "../types/game";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore JSON parse failures on error bodies
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getDifficultyLevels: () => request<DifficultyLevelOut[]>("/api/difficulty-levels"),

  createGame: (humanColor: PlayerColor, aiElo: number) =>
    request<GameStateOut>("/api/games", {
      method: "POST",
      body: JSON.stringify({ human_color: humanColor, ai_elo: aiElo }),
    }),

  getGame: (gameId: string) => request<GameStateOut>(`/api/games/${gameId}`),

  makeMove: (gameId: string, uci: string) =>
    request<GameStateOut>(`/api/games/${gameId}/moves`, {
      method: "POST",
      body: JSON.stringify({ uci }),
    }),

  playAiMove: (gameId: string) =>
    request<GameStateOut>(`/api/games/${gameId}/ai-move`, { method: "POST" }),

  resign: (gameId: string, resigningColor: PlayerColor) =>
    request<GameStateOut>(`/api/games/${gameId}/resign`, {
      method: "POST",
      body: JSON.stringify({ resigning_color: resigningColor }),
    }),

  abandonGame: (gameId: string) =>
    request<{ ok: boolean }>(`/api/games/${gameId}`, { method: "DELETE" }),
};

export { ApiError };
