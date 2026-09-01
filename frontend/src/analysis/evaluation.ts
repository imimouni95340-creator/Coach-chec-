/**
 * Engine scores: representation, point of view, and loss measurement (§3).
 *
 * THE trap this module exists to close: Stockfish always reports a score from
 * the point of view of the side to move. So the score "before" a move belongs
 * to the player who is about to move, while the score "after" that same move
 * belongs to their OPPONENT. Comparing the two raw numbers measures nothing.
 * Every value here is therefore explicitly tagged with whose point of view it
 * is in, and converting is the caller's deliberate act.
 */
import type { PlayerColor } from "../types/game";

/** A raw engine score. `mate` counts plies-to-mate, negative when being mated. */
export type Score =
  | { type: "cp"; value: number }
  | { type: "mate"; value: number };

/** Score expressed from White's point of view (what the eval chart plots). */
export type WhitePovScore = Score;

/** Flips a score to the other side's point of view. */
export function negate(score: Score): Score {
  return { type: score.type, value: -score.value } as Score;
}

/**
 * Converts a score reported by the engine (side-to-move POV) to White's POV.
 * `sideToMove` is the side whose turn it is in the analysed position.
 */
export function toWhitePov(score: Score, sideToMove: PlayerColor): WhitePovScore {
  return sideToMove === "white" ? score : negate(score);
}

/** Converts a White-POV score to the point of view of `color`. */
export function fromWhitePov(score: WhitePovScore, color: PlayerColor): Score {
  return color === "white" ? score : negate(score);
}

/**
 * Win probability (0-100) for the side the score belongs to.
 *
 * Uses the logistic curve Lichess fitted on real games. We classify moves on
 * this rather than on raw centipawns because a centipawn is not worth the
 * same in a balanced position as in a won one: +8.0 -> +6.0 loses 200cp and
 * changes nothing, while +0.2 -> -1.8 loses 200cp and loses the game (§4).
 */
export function winProbability(score: Score): number {
  if (score.type === "mate") {
    // Mate in 0 is not meaningful here; sign alone decides.
    return score.value > 0 ? 100 : 0;
  }
  const capped = Math.max(-2000, Math.min(2000, score.value));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * capped)) - 1);
}

/**
 * How much win probability `mover` lost by playing a move, in percentage
 * points (0-100, never negative).
 *
 * @param beforeMoverPov evaluation of the position BEFORE the move, already
 *        converted to the mover's point of view.
 * @param afterMoverPov  evaluation of the position AFTER the move, also in
 *        the mover's point of view (so the caller must negate the engine's
 *        raw score, since the opponent is to move there).
 */
export function winProbabilityLoss(beforeMoverPov: Score, afterMoverPov: Score): number {
  const loss = winProbability(beforeMoverPov) - winProbability(afterMoverPov);
  return Math.max(0, loss);
}

/** Centipawn loss, kept alongside win-probability loss for reporting. */
export function centipawnLoss(beforeMoverPov: Score, afterMoverPov: Score): number {
  const before = toCentipawns(beforeMoverPov);
  const after = toCentipawns(afterMoverPov);
  return Math.max(0, before - after);
}

/** Clamped centipawn view of a score; mates become a large finite value. */
export function toCentipawns(score: Score): number {
  if (score.type === "mate") return score.value > 0 ? 10000 : -10000;
  return score.value;
}

/** Human-readable form, always from White's point of view ("+1.24", "M3"). */
export function formatWhitePov(score: WhitePovScore): string {
  if (score.type === "mate") {
    const n = Math.abs(score.value);
    return `${score.value > 0 ? "" : "-"}M${n}`;
  }
  const pawns = score.value / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

/** True when the score means "the side to move gets mated". */
export function isGettingMated(score: Score): boolean {
  return score.type === "mate" && score.value < 0;
}
