/**
 * Talks to a real Stockfish compiled to WebAssembly, running in a Web Worker.
 *
 * This is the ONLY module that speaks UCI. It knows nothing about game
 * history, PGN or storage — it answers two questions about a position:
 * "which move do you play at this difficulty?" (game play, Phase 1) and
 * "how do you assess it?" (analysis, Phase 2). Everything runs on the
 * device: no network, no server.
 */
import { getProfile } from "./difficulty";
import type { Score } from "../analysis/evaluation";

export interface EngineMoveResult {
  uci: string;
  thinkingTimeMs: number;
  wasBlunder: boolean; // a deliberately sub-optimal move was chosen
}

/** One candidate line returned by the engine, ranked 1 = best. */
export interface EngineLine {
  /** MultiPV rank, 1-based. */
  rank: number;
  /** Score from the SIDE TO MOVE's point of view, as UCI reports it. */
  score: Score;
  /** Principal variation, in UCI moves. */
  pv: string[];
  /** Depth actually reached for this line. */
  depth: number;
}

export interface AnalysisResult {
  lines: EngineLine[];
  depth: number;
  timeMs: number;
}

export interface AnalyseOptions {
  depth: number;
  movetimeMs: number;
  multiPv: number;
}

/** Where the engine assets live (copied out of node_modules by scripts/copy-engine.mjs). */
const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish.wasm.js`;

export class EngineUnavailableError extends Error {}

export class StockfishEngine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private readyPromise: Promise<void>;

  constructor() {
    try {
      this.worker = new Worker(ENGINE_URL);
    } catch (cause) {
      throw new EngineUnavailableError(`Could not start the chess engine from ${ENGINE_URL}`);
    }
    this.worker.onmessage = (event: MessageEvent) => {
      const line = typeof event.data === "string" ? event.data : "";
      if (line) for (const listener of [...this.listeners]) listener(line);
    };
    this.readyPromise = this.handshake();
  }

  /** Resolves once the engine has answered `uciok` + `readyok`. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  terminate(): void {
    this.listeners.clear();
    this.worker.terminate();
  }

  private send(command: string): void {
    this.worker.postMessage(command);
  }

  /** Waits until `predicate` accepts a line, feeding every line to `onLine`. */
  private waitFor(
    predicate: (line: string) => boolean,
    onLine?: (line: string) => void,
    timeoutMs = 60000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new EngineUnavailableError("The chess engine stopped responding."));
      }, timeoutMs);

      const listener = (line: string) => {
        onLine?.(line);
        if (predicate(line)) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve(line);
        }
      };
      this.listeners.add(listener);
    });
  }

  private async handshake(): Promise<void> {
    this.send("uci");
    await this.waitFor((l) => l === "uciok" || l.startsWith("uciok"));
    this.send("isready");
    await this.waitFor((l) => l.startsWith("readyok"));
  }

  /**
   * Best move for `fen`, calibrated to `targetElo`.
   * `moves` is the UCI move list from the starting position, so the engine
   * sees repetitions (needed for threefold-repetition awareness).
   */
  async bestMove(fen: string, targetElo: number, randomFn: () => number = Math.random): Promise<EngineMoveResult> {
    await this.readyPromise;
    const profile = getProfile(targetElo);

    const wantsBlunder = profile.blunderProbability > 0 && randomFn() < profile.blunderProbability;
    const multiPv = wantsBlunder ? profile.blunderMultiPv : 1;

    this.send(`setoption name Skill Level value ${profile.skillLevel}`);
    this.send(`setoption name MultiPV value ${multiPv}`);
    this.send(`position fen ${fen}`);

    // Keep the deepest first-move seen for each MultiPV slot. Deeper
    // iterations overwrite shallower ones, so at `bestmove` this holds the
    // engine's final ranking.
    const candidatesByPv = new Map<number, string>();
    const startedAt = performance.now();

    this.send(`go depth ${profile.depth} movetime ${profile.movetimeMs}`);

    const bestmoveLine = await this.waitFor(
      (line) => line.startsWith("bestmove"),
      (line) => {
        if (!line.startsWith("info ") || !line.includes(" pv ")) return;
        const pvIndexMatch = line.match(/ multipv (\d+)/);
        const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (!pvMatch) return;
        candidatesByPv.set(pvIndexMatch ? Number(pvIndexMatch[1]) : 1, pvMatch[1]);
      },
    );

    const thinkingTimeMs = Math.round(performance.now() - startedAt);
    const bestmove = bestmoveLine.split(/\s+/)[1];

    if (!bestmove || bestmove === "(none)") {
      throw new EngineUnavailableError("The chess engine returned no move.");
    }

    if (wantsBlunder) {
      const candidates = [...candidatesByPv.values()];
      if (candidates.length > 1) {
        const picked = candidates[Math.floor(randomFn() * candidates.length)];
        return { uci: picked, thinkingTimeMs, wasBlunder: picked !== bestmove };
      }
    }

    return { uci: bestmove, thinkingTimeMs, wasBlunder: false };
  }

  /**
   * Assesses a position at full strength (Phase 2 analysis).
   *
   * Unlike `bestMove`, this never weakens the engine: Skill Level is forced
   * back to 20, because an analysis must reflect the best judgement available,
   * not the difficulty the player chose to face.
   *
   * Scores come back from the SIDE TO MOVE's point of view, exactly as UCI
   * reports them; converting is the caller's explicit job (see
   * analysis/evaluation.ts).
   */
  async analyse(fen: string, options: AnalyseOptions): Promise<AnalysisResult> {
    await this.readyPromise;

    this.send("setoption name Skill Level value 20");
    this.send(`setoption name MultiPV value ${options.multiPv}`);
    this.send(`position fen ${fen}`);

    // Deeper iterations overwrite shallower ones for the same MultiPV slot,
    // so at `bestmove` this map holds the engine's final ranking.
    const linesByRank = new Map<number, EngineLine>();
    const startedAt = performance.now();

    this.send(`go depth ${options.depth} movetime ${options.movetimeMs}`);

    await this.waitFor(
      (line) => line.startsWith("bestmove"),
      (line) => {
        const parsed = parseInfoLine(line);
        if (parsed) linesByRank.set(parsed.rank, parsed);
      },
    );

    const lines = [...linesByRank.values()].sort((a, b) => a.rank - b.rank);
    return {
      lines,
      depth: lines.length ? Math.max(...lines.map((l) => l.depth)) : 0,
      timeMs: Math.round(performance.now() - startedAt),
    };
  }
}

/**
 * Parses one UCI `info` line into a candidate line.
 *
 * Returns null for the many info lines that carry no principal variation
 * (currmove, nps-only updates, ...). Exported for testing: getting this
 * parsing wrong silently corrupts every evaluation downstream.
 */
export function parseInfoLine(line: string): EngineLine | null {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return null;

  const depthMatch = line.match(/ depth (\d+)/);
  const rankMatch = line.match(/ multipv (\d+)/);
  const cpMatch = line.match(/ score cp (-?\d+)/);
  const mateMatch = line.match(/ score mate (-?\d+)/);
  const pvMatch = line.match(/ pv (.+)$/);

  if (!pvMatch || (!cpMatch && !mateMatch)) return null;

  const pv = pvMatch[1].trim().split(/\s+/).filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
  if (pv.length === 0) return null;

  const score: Score = mateMatch
    ? { type: "mate", value: Number(mateMatch[1]) }
    : { type: "cp", value: Number(cpMatch![1]) };

  return {
    rank: rankMatch ? Number(rankMatch[1]) : 1,
    score,
    pv,
    depth: depthMatch ? Number(depthMatch[1]) : 0,
  };
}
