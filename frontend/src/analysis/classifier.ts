/**
 * Turning an evaluation change into a judgement about a move (§4).
 *
 * The guiding rule, and the reason this file is not two lines long: the
 * engine's first choice is NOT the only good move. At the starting position
 * Stockfish rates Nf3 +0.75, e4 +0.69 and d4 +0.62 — calling the last two
 * "mistakes" would be nonsense. So a move that sits among the engine's top
 * candidates, close to the best, is never reported as an error, whatever the
 * arithmetic says.
 */
import type { AnalysisConfig } from "./config";
import type { EngineLine } from "../engine/stockfishEngine";
import {
  centipawnLoss,
  toCentipawns,
  winProbabilityLoss,
  type Score,
} from "./evaluation";

export type MoveQuality =
  | "excellent"
  | "good"
  | "playable"
  | "inaccuracy"
  | "mistake"
  | "blunder";

/** Ordering used to make a judgement no harsher than another. */
const SEVERITY: MoveQuality[] = [
  "excellent",
  "good",
  "playable",
  "inaccuracy",
  "mistake",
  "blunder",
];

function noHarsherThan(quality: MoveQuality, cap: MoveQuality): MoveQuality {
  return SEVERITY.indexOf(quality) > SEVERITY.indexOf(cap) ? cap : quality;
}

export interface ClassifyInput {
  /** The move actually played, in UCI. */
  playedUci: string;
  /** Engine's candidate lines for the position BEFORE the move. */
  candidateLines: EngineLine[];
  /** Evaluation before the move, in the MOVER's point of view. */
  evalBeforeMoverPov: Score;
  /** Evaluation after the move, in the MOVER's point of view. */
  evalAfterMoverPov: Score;
  /** How many legal moves the mover had. 1 means the move was forced. */
  legalMoveCount: number;
  config: AnalysisConfig;
}

export interface Classification {
  quality: MoveQuality;
  /** Loss of winning chances, in percentage points. */
  winProbLoss: number;
  /** Raw centipawn loss, for reporting. */
  cpLoss: number;
  /** The move was the engine's first choice. */
  wasBestMove: boolean;
  /** The move was one of the engine's candidate lines. */
  wasAmongCandidates: boolean;
  /** The move was forced: there was nothing else legal. */
  wasForced: boolean;
  /** Engine's preferred move, when known. */
  bestUci: string | null;
}

export function classifyMove(input: ClassifyInput): Classification {
  const { playedUci, candidateLines, config, legalMoveCount } = input;
  const best = candidateLines.find((l) => l.rank === 1) ?? candidateLines[0] ?? null;
  const bestUci = best?.pv[0] ?? null;
  const wasBestMove = bestUci !== null && bestUci === playedUci;

  const winProbLoss = winProbabilityLoss(input.evalBeforeMoverPov, input.evalAfterMoverPov);
  const cpLoss = centipawnLoss(input.evalBeforeMoverPov, input.evalAfterMoverPov);

  const playedLine = candidateLines.find((l) => l.pv[0] === playedUci) ?? null;
  const wasAmongCandidates = playedLine !== null;

  // A move with no alternative says nothing about the player.
  const wasForced = legalMoveCount <= 1;

  const base: Omit<Classification, "quality"> = {
    winProbLoss,
    cpLoss,
    wasBestMove,
    wasAmongCandidates,
    wasForced,
    bestUci,
  };

  if (wasForced) return { ...base, quality: "good" };
  if (wasBestMove) return { ...base, quality: "excellent" };

  let quality = fromLoss(winProbLoss, config);

  // The acceptable zone: among the engine's candidates and materially as good
  // as its favourite. Such a move is a legitimate choice, not an error.
  if (playedLine && best) {
    const gapCp = toCentipawns(best.score) - toCentipawns(playedLine.score);
    if (gapCp <= config.acceptableZoneCp) {
      quality = noHarsherThan(quality, "good");
    }
  }

  return { ...base, quality };
}

function fromLoss(winProbLoss: number, config: AnalysisConfig): MoveQuality {
  const t = config.thresholds;
  if (winProbLoss <= t.excellentMaxLoss) return "excellent";
  if (winProbLoss <= t.goodMaxLoss) return "good";
  if (winProbLoss <= t.playableMaxLoss) return "playable";
  if (winProbLoss <= t.inaccuracyMaxLoss) return "inaccuracy";
  if (winProbLoss <= t.mistakeMaxLoss) return "mistake";
  return "blunder";
}

/** Moves a player would want to see explained. */
export function isMistakeLike(quality: MoveQuality): boolean {
  return quality === "inaccuracy" || quality === "mistake" || quality === "blunder";
}

/** Symbol used next to the move in the UI, chess-annotation style. */
export function qualitySymbol(quality: MoveQuality): string {
  switch (quality) {
    case "excellent": return "!";
    case "inaccuracy": return "?!";
    case "mistake": return "?";
    case "blunder": return "??";
    default: return "";
  }
}

export const QUALITY_LABELS_FR: Record<MoveQuality, string> = {
  excellent: "Excellent",
  good: "Bon",
  playable: "Jouable",
  inaccuracy: "Imprécision",
  mistake: "Erreur",
  blunder: "Grosse erreur",
};
