import { describe, expect, it } from "vitest";
import { classifyMove, isMistakeLike, type ClassifyInput } from "./classifier";
import { DEFAULT_ANALYSIS_CONFIG } from "./config";
import type { EngineLine } from "../engine/stockfishEngine";
import type { Score } from "./evaluation";

const cp = (v: number): Score => ({ type: "cp", value: v });
const mate = (v: number): Score => ({ type: "mate", value: v });
const line = (rank: number, uci: string, score: Score): EngineLine => ({
  rank, score, pv: [uci], depth: 18,
});

function classify(over: Partial<ClassifyInput>) {
  return classifyMove({
    playedUci: "e2e4",
    candidateLines: [line(1, "e2e4", cp(30))],
    evalBeforeMoverPov: cp(30),
    evalAfterMoverPov: cp(30),
    legalMoveCount: 30,
    config: DEFAULT_ANALYSIS_CONFIG,
    ...over,
  });
}

describe("the engine's favourite is not the only good move", () => {
  // Real numbers measured from our own Stockfish build at the start position:
  // Nf3 +0.75, e4 +0.69, d4 +0.62.
  const candidates = [
    line(1, "g1f3", cp(75)),
    line(2, "e2e4", cp(69)),
    line(3, "d2d4", cp(62)),
  ];

  it("does not call e4 an error just because the engine prefers Nf3", () => {
    const r = classify({
      playedUci: "e2e4",
      candidateLines: candidates,
      evalBeforeMoverPov: cp(75),
      evalAfterMoverPov: cp(69),
    });
    expect(isMistakeLike(r.quality)).toBe(false);
    expect(r.wasAmongCandidates).toBe(true);
    expect(r.wasBestMove).toBe(false);
  });

  it("does not call d4 an error either", () => {
    const r = classify({
      playedUci: "d2d4",
      candidateLines: candidates,
      evalBeforeMoverPov: cp(75),
      evalAfterMoverPov: cp(62),
    });
    expect(isMistakeLike(r.quality)).toBe(false);
  });

  it("marks the engine's own first choice as excellent", () => {
    const r = classify({
      playedUci: "g1f3",
      candidateLines: candidates,
      evalBeforeMoverPov: cp(75),
      evalAfterMoverPov: cp(75),
    });
    expect(r.quality).toBe("excellent");
    expect(r.wasBestMove).toBe(true);
  });
});

describe("real errors are still caught", () => {
  it("flags a blunder that throws away a winning position", () => {
    const r = classify({
      playedUci: "a2a3",
      candidateLines: [line(1, "d1h5", cp(600))],
      evalBeforeMoverPov: cp(600),
      evalAfterMoverPov: cp(-400),
    });
    expect(r.quality).toBe("blunder");
    expect(r.bestUci).toBe("d1h5");
  });

  it("flags walking into mate as a blunder", () => {
    const r = classify({
      playedUci: "a2a3",
      candidateLines: [line(1, "e1g1", cp(20))],
      evalBeforeMoverPov: cp(20),
      evalAfterMoverPov: mate(-2),
    });
    expect(r.quality).toBe("blunder");
  });

  it("grades a moderate slip as a mistake, not a blunder", () => {
    // Slightly better to clearly worse: ~28 points of winning chances.
    const r = classify({
      playedUci: "a2a3",
      candidateLines: [line(1, "d2d4", cp(40))],
      evalBeforeMoverPov: cp(40),
      evalAfterMoverPov: cp(-290),
    });
    expect(r.quality).toBe("mistake");
  });

  it("grades a smaller slip as an inaccuracy", () => {
    const r = classify({
      playedUci: "a2a3",
      candidateLines: [line(1, "d2d4", cp(40))],
      evalBeforeMoverPov: cp(40),
      evalAfterMoverPov: cp(-180),
    });
    expect(r.quality).toBe("inaccuracy");
  });

  it("leaves a minor drift around equality unflagged", () => {
    // +0.40 to -0.25 is a drift, not something to lecture the player about.
    const r = classify({
      playedUci: "a2a3",
      candidateLines: [line(1, "d2d4", cp(40))],
      evalBeforeMoverPov: cp(40),
      evalAfterMoverPov: cp(-25),
    });
    expect(isMistakeLike(r.quality)).toBe(false);
  });
});

describe("context that must not be punished", () => {
  it("never blames the player for a forced move", () => {
    const r = classify({
      playedUci: "e1f1",
      candidateLines: [line(1, "e1f1", mate(-3))],
      evalBeforeMoverPov: cp(0),
      evalAfterMoverPov: mate(-3),
      legalMoveCount: 1,
    });
    expect(r.wasForced).toBe(true);
    expect(isMistakeLike(r.quality)).toBe(false);
  });

  it("does not turn a harmless drop in an already-won position into an error", () => {
    // 200cp lost, but still completely winning.
    const r = classify({
      playedUci: "a2a3",
      candidateLines: [line(1, "d1d8", cp(900))],
      evalBeforeMoverPov: cp(900),
      evalAfterMoverPov: cp(700),
    });
    expect(isMistakeLike(r.quality)).toBe(false);
  });

  it("copes with an empty candidate list without crashing", () => {
    // The engine may return nothing (mate on the board, aborted search).
    // Grading must still work, just without a "you should have played" move.
    const r = classify({ candidateLines: [], evalBeforeMoverPov: cp(0), evalAfterMoverPov: cp(-300) });
    expect(r.bestUci).toBeNull();
    expect(r.wasAmongCandidates).toBe(false);
    expect(isMistakeLike(r.quality)).toBe(true);
  });
});
