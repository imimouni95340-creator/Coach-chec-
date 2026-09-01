/**
 * Every tunable of the analysis pipeline, in one place (Phase 2, §18).
 *
 * Nothing here is a universal truth: these are starting values chosen to be
 * readable and adjustable. They are deliberately NOT scattered across the
 * codebase so that calibrating the coach later means editing this file only.
 */

/** Stockfish search limits for one analysis pass. */
export interface PassConfig {
  /** Max search depth. */
  depth: number;
  /** Hard time cap per position (ms); whichever limit hits first wins, so a
   *  slow phone degrades gracefully instead of freezing. */
  movetimeMs: number;
  /** Number of candidate lines requested. >1 is what lets us recognise that
   *  several different moves are all perfectly reasonable. */
  multiPv: number;
}

export interface AnalysisConfig {
  /** Pass 1: every position, fast. Finds suspects. */
  firstPass: PassConfig;
  /** Pass 2: only the suspicious/critical positions, slower and wider. */
  secondPass: PassConfig;

  /**
   * Classification thresholds, expressed as a loss of WIN PROBABILITY
   * (percentage points, 0-100) rather than centipawns.
   *
   * Why: a centipawn is not worth the same everywhere. Going from +8.0 to
   * +6.0 is 200cp but changes nothing (still winning); going from +0.2 to
   * -1.8 is also 200cp but throws the game away. Win probability captures
   * that, so we do not label harmless moves as mistakes (§4, §22).
   *
   * The inaccuracy/mistake/blunder cut-offs (10/20/30 points) are the ones
   * Lichess settled on over millions of analysed games. Using an established
   * scale rather than numbers of our own invention keeps the labels
   * meaningful, and it is deliberately strict: it flags few moves, which is
   * what makes the ones it does flag worth reading (§5).
   */
  thresholds: {
    /** Below this loss, the move is as good as the engine's choice. */
    excellentMaxLoss: number;
    /** Sound move. */
    goodMaxLoss: number;
    /** Different from the engine but without real consequence. */
    playableMaxLoss: number;
    /** Slight loss. */
    inaccuracyMaxLoss: number;
    /** Significant loss; beyond this it is a blunder. */
    mistakeMaxLoss: number;
  };

  /**
   * "Acceptable zone": a played move that is among the engine's top lines and
   * within this centipawn distance of the best move is not an error, even if
   * it is not the engine's first choice (the Nc3 +0.72 / d4 +0.68 case).
   */
  acceptableZoneCp: number;

  /** A position is re-examined in pass 2 when pass 1 already suggests trouble. */
  secondPassTriggerLoss: number;

  /** Selection of the handful of moments actually worth showing (§5). */
  criticalMoments: {
    /** Hard cap: a few very instructive moments beat thirty comments. */
    maxCount: number;
    /** Minimum win-probability swing for a moment to qualify at all. */
    minLoss: number;
    /** Always keep missed mates and mistakes at least this severe. */
    alwaysKeepLoss: number;
  };

  /** Game phase detection (§10). */
  phases: {
    /** Plies below which we are still in the opening, absent other signals. */
    openingMaxPly: number;
    /** Total non-pawn, non-king material (in pawns) at or below which the
     *  position counts as an endgame. */
    endgameMaterialMax: number;
  };
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  firstPass: { depth: 12, movetimeMs: 300, multiPv: 1 },
  secondPass: { depth: 18, movetimeMs: 1500, multiPv: 3 },

  thresholds: {
    excellentMaxLoss: 2,
    goodMaxLoss: 5,
    playableMaxLoss: 10,
    inaccuracyMaxLoss: 20,
    mistakeMaxLoss: 30,
  },

  acceptableZoneCp: 30,
  secondPassTriggerLoss: 8,

  criticalMoments: {
    maxCount: 6,
    minLoss: 15,
    alwaysKeepLoss: 30,
  },

  phases: {
    openingMaxPly: 24,
    endgameMaterialMax: 14,
  },
};
