import { describe, expect, it } from "vitest";
import { AVAILABLE_ELO_LEVELS, ELO_PROFILES, getProfile } from "./difficulty";

describe("difficulty ladder", () => {
  it("exposes the eleven requested levels", () => {
    expect(AVAILABLE_ELO_LEVELS).toEqual([100, 300, 500, 700, 900, 1100, 1300, 1500, 1700, 1900, 2100]);
    expect(Object.keys(ELO_PROFILES)).toHaveLength(11);
  });

  it("returns the profile matching the requested Elo", () => {
    for (const elo of AVAILABLE_ELO_LEVELS) {
      expect(getProfile(elo).targetElo).toBe(elo);
    }
  });

  it("throws on an unknown level", () => {
    expect(() => getProfile(9999)).toThrow(/Unknown Elo level/);
  });

  it("never weakens the engine as the target Elo rises", () => {
    const skill = AVAILABLE_ELO_LEVELS.map((e) => getProfile(e).skillLevel);
    const depth = AVAILABLE_ELO_LEVELS.map((e) => getProfile(e).depth);
    expect(skill).toEqual([...skill].sort((a, b) => a - b));
    expect(depth).toEqual([...depth].sort((a, b) => a - b));
  });

  it("blunders less and less as the target Elo rises", () => {
    const blunders = AVAILABLE_ELO_LEVELS.map((e) => getProfile(e).blunderProbability);
    expect(blunders).toEqual([...blunders].sort((a, b) => b - a));
  });

  it("keeps Skill Level inside Stockfish's accepted 0-20 range", () => {
    for (const elo of AVAILABLE_ELO_LEVELS) {
      const { skillLevel } = getProfile(elo);
      expect(skillLevel).toBeGreaterThanOrEqual(0);
      expect(skillLevel).toBeLessThanOrEqual(20);
    }
  });

  it("caps thinking time so a slow phone never hangs on a move", () => {
    for (const elo of AVAILABLE_ELO_LEVELS) {
      expect(getProfile(elo).movetimeMs).toBeLessThanOrEqual(2000);
    }
  });

  it("asks for several candidate moves whenever it may blunder", () => {
    for (const elo of AVAILABLE_ELO_LEVELS) {
      const { blunderProbability, blunderMultiPv } = getProfile(elo);
      if (blunderProbability > 0) expect(blunderMultiPv).toBeGreaterThan(1);
    }
  });
});
