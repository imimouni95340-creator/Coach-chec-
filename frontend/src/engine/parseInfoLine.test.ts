import { describe, expect, it } from "vitest";
import { parseInfoLine } from "./stockfishEngine";

describe("UCI info parsing", () => {
  it("reads a centipawn line with its rank, depth and PV", () => {
    const line =
      "info depth 18 seldepth 24 multipv 2 score cp -37 nodes 120345 nps 900000 time 133 pv d7d5 g1f3 b8c6";
    const parsed = parseInfoLine(line)!;
    expect(parsed.rank).toBe(2);
    expect(parsed.depth).toBe(18);
    expect(parsed.score).toEqual({ type: "cp", value: -37 });
    expect(parsed.pv).toEqual(["d7d5", "g1f3", "b8c6"]);
  });

  it("reads a mate score, including being mated", () => {
    expect(parseInfoLine("info depth 12 multipv 1 score mate 3 pv e2e4")!.score)
      .toEqual({ type: "mate", value: 3 });
    expect(parseInfoLine("info depth 12 multipv 1 score mate -2 pv e7e5")!.score)
      .toEqual({ type: "mate", value: -2 });
  });

  it("defaults to rank 1 when MultiPV is not reported", () => {
    expect(parseInfoLine("info depth 5 score cp 20 pv e2e4")!.rank).toBe(1);
  });

  it("keeps promotion moves in the PV", () => {
    expect(parseInfoLine("info depth 9 score cp 900 pv e7e8q a1a2")!.pv).toEqual(["e7e8q", "a1a2"]);
  });

  it("ignores info lines that carry no evaluated variation", () => {
    expect(parseInfoLine("info depth 1 currmove e2e4 currmovenumber 1")).toBeNull();
    expect(parseInfoLine("info nodes 1000 nps 50000 time 20")).toBeNull();
    expect(parseInfoLine("bestmove e2e4 ponder e7e5")).toBeNull();
    expect(parseInfoLine("info depth 4 score cp 12")).toBeNull(); // no pv
  });

  it("does not mistake a string-only PV for moves", () => {
    expect(parseInfoLine("info depth 3 score cp 5 pv (none)")).toBeNull();
  });
});
