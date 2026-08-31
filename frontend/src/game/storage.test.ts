import { beforeEach, describe, expect, it } from "vitest";
import { GameSession } from "./gameSession";
import { clearSavedGames, getSavedGame, listSavedGames, saveFinishedGame } from "./storage";

function playedGame() {
  const session = new GameSession("white", 900);
  for (const uci of ["f2f3", "e7e5", "g2g4", "d8h4"]) session.applyMove(uci, null);
  return session;
}

describe("on-device game archive", () => {
  beforeEach(() => clearSavedGames());

  it("starts empty", () => {
    expect(listSavedGames()).toEqual([]);
  });

  it("stores a finished game with its PGN and metadata", () => {
    const session = playedGame();
    const saved = saveFinishedGame(session);

    expect(saved.result).toBe("0-1");
    expect(saved.status).toBe("checkmate");
    expect(saved.aiElo).toBe(900);
    expect(saved.humanColor).toBe("white");
    expect(saved.plyCount).toBe(4);
    expect(saved.pgn).toContain("1. f3 e5 2. g4 Qh4#");
    expect(saved.initialFen).toContain("rnbqkbnr/pppppppp");
    expect(saved.createdAt).toBeTruthy();
    expect(saved.finishedAt).toBeTruthy();
  });

  it("survives a reload — the archive is read back from storage", () => {
    const session = playedGame();
    saveFinishedGame(session);

    const reloaded = getSavedGame(session.id);
    expect(reloaded?.id).toBe(session.id);
    expect(reloaded?.pgn).toContain("Qh4#");
  });

  it("keeps several games, newest first, without duplicating a re-save", () => {
    const first = playedGame();
    saveFinishedGame(first);
    const second = playedGame();
    saveFinishedGame(second);
    saveFinishedGame(second); // saving twice must not duplicate

    const all = listSavedGames();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe(second.id);
    expect(all[1].id).toBe(first.id);
  });

  it("records the time each side spent thinking", () => {
    const session = new GameSession("black", 1500);
    session.applyMove("e2e4", 1500); // engine plays white here
    session.resign("black");
    const saved = saveFinishedGame(session);
    expect(saved.whiteTimeUsedMs).toBe(1500);
    expect(saved.result).toBe("1-0");
  });
});
