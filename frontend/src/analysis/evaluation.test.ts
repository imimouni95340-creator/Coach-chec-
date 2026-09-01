import { describe, expect, it } from "vitest";
import {
  centipawnLoss,
  formatWhitePov,
  fromWhitePov,
  negate,
  toWhitePov,
  winProbability,
  winProbabilityLoss,
  type Score,
} from "./evaluation";

const cp = (v: number): Score => ({ type: "cp", value: v });
const mate = (v: number): Score => ({ type: "mate", value: v });

describe("point of view conversion", () => {
  it("keeps a white-to-move score unchanged in white POV", () => {
    expect(toWhitePov(cp(120), "white")).toEqual(cp(120));
  });

  it("flips a black-to-move score into white POV", () => {
    // Black to move and Black is winning: engine says +150 (Black's POV),
    // which is -150 from White's POV.
    expect(toWhitePov(cp(150), "black")).toEqual(cp(-150));
  });

  it("flips mate scores too", () => {
    expect(toWhitePov(mate(3), "black")).toEqual(mate(-3));
  });

  it("round-trips between white POV and a colour's POV", () => {
    const white = cp(-80);
    expect(fromWhitePov(white, "black")).toEqual(cp(80));
    expect(fromWhitePov(white, "white")).toEqual(cp(-80));
  });

  it("negation is symmetric", () => {
    expect(negate(negate(cp(42)))).toEqual(cp(42));
  });
});

describe("win probability", () => {
  it("is 50% for a dead-equal position", () => {
    expect(winProbability(cp(0))).toBeCloseTo(50, 5);
  });

  it("rises with the advantage and is symmetric", () => {
    expect(winProbability(cp(100))).toBeGreaterThan(50);
    expect(winProbability(cp(-100))).toBeCloseTo(100 - winProbability(cp(100)), 5);
  });

  it("treats mate as certain", () => {
    expect(winProbability(mate(1))).toBe(100);
    expect(winProbability(mate(-1))).toBe(0);
  });
});

describe("loss measurement", () => {
  it("reports no loss when the position is unchanged", () => {
    expect(winProbabilityLoss(cp(30), cp(30))).toBe(0);
  });

  it("never reports a negative loss when the move improves the position", () => {
    expect(winProbabilityLoss(cp(0), cp(200))).toBe(0);
  });

  it("treats an equal centipawn drop as far worse near equality than when winning", () => {
    // Both drops are exactly 200cp, but only the first one loses the game.
    const decisive = winProbabilityLoss(cp(20), cp(-180));
    const harmless = winProbabilityLoss(cp(800), cp(600));
    expect(decisive).toBeGreaterThan(harmless * 3);
  });

  it("scores hanging a won position as losing essentially all winning chances", () => {
    // +5.00 is ~86% winning chances; walking into mate gives all of it away,
    // so the loss equals the whole win probability that was on the table.
    const loss = winProbabilityLoss(cp(500), mate(-2));
    expect(loss).toBeCloseTo(winProbability(cp(500)), 5);
    expect(loss).toBeGreaterThan(80);
  });

  it("still exposes raw centipawn loss for reporting", () => {
    expect(centipawnLoss(cp(120), cp(-30))).toBe(150);
    expect(centipawnLoss(cp(-30), cp(120))).toBe(0);
  });
});

describe("the classic sign bug", () => {
  it("measures a real blunder correctly across the side-to-move flip", () => {
    // White to move, White is slightly better: engine reports +40 (White POV).
    const beforeEngine = cp(40);
    const beforeMoverPov = beforeEngine; // mover is White

    // White blunders. Now BLACK is to move and the engine reports +900 —
    // that is +900 for BLACK. Naively comparing 40 vs 900 would call this a
    // brilliant move; converting to the mover's POV shows -900.
    const afterEngine = cp(900);
    const afterMoverPov = negate(afterEngine);

    expect(winProbabilityLoss(beforeMoverPov, afterMoverPov)).toBeGreaterThan(40);
    expect(centipawnLoss(beforeMoverPov, afterMoverPov)).toBe(940);
  });
});

describe("formatting", () => {
  it("shows white-POV pawns and mate distance", () => {
    expect(formatWhitePov(cp(124))).toBe("+1.24");
    expect(formatWhitePov(cp(-50))).toBe("-0.50");
    expect(formatWhitePov(mate(3))).toBe("M3");
    expect(formatWhitePov(mate(-2))).toBe("-M2");
  });
});
