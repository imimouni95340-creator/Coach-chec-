/**
 * Calibration of Stockfish's playing strength against a target Elo rating.
 *
 * IMPORTANT — this is a first approximation, not a scientific calibration.
 *
 * This is the client-side (WebAssembly) counterpart of
 * `backend/app/engine/difficulty.py`, with one substantial difference: the
 * WASM build we ship (stockfish.js 10.0.2) does NOT expose `UCI_LimitStrength`
 * / `UCI_Elo` — verified by reading its `uci` option list at runtime. So where
 * the Python backend could lean on Stockfish's own Elo limiter for the upper
 * levels, here every level is shaped by three independent levers only:
 *
 * - `skillLevel`  Stockfish's own 0-20 knob. At low values the engine
 *                  deliberately searches less and picks weaker moves.
 * - `depth` / `movetimeMs`
 *                  Hard search limits. The engine stops at whichever comes
 *                  first, which also guarantees the UI never hangs on a slow
 *                  phone.
 * - `blunderProbability` / `blunderMultiPv`
 *                  Even at skill 0 the engine rarely hangs a piece the way a
 *                  beginner does. We occasionally ask for the top-N moves and
 *                  play a random one of them, to emulate human-like errors.
 *
 * The Elo label on each level is a TARGET, not a guarantee. Tuning it properly
 * means measuring real results (engine-vs-engine matches, or the player's own
 * score over many games) and adjusting this table — which is exactly why the
 * numbers live in one small, replaceable table.
 */

export interface DifficultyProfile {
  targetElo: number;
  skillLevel: number; // Stockfish "Skill Level" UCI option, 0-20
  depth: number; // Max search depth
  movetimeMs: number; // Max thinking time; whichever limit hits first wins
  blunderProbability: number; // 0..1 chance of playing a deliberately weaker move
  blunderMultiPv: number; // How many top candidate moves to pick a "blunder" from
}

export const ELO_PROFILES: Record<number, DifficultyProfile> = {
  100: { targetElo: 100, skillLevel: 0, depth: 1, movetimeMs: 50, blunderProbability: 0.75, blunderMultiPv: 6 },
  300: { targetElo: 300, skillLevel: 0, depth: 1, movetimeMs: 80, blunderProbability: 0.6, blunderMultiPv: 6 },
  500: { targetElo: 500, skillLevel: 1, depth: 2, movetimeMs: 100, blunderProbability: 0.45, blunderMultiPv: 5 },
  700: { targetElo: 700, skillLevel: 2, depth: 3, movetimeMs: 150, blunderProbability: 0.32, blunderMultiPv: 4 },
  900: { targetElo: 900, skillLevel: 4, depth: 4, movetimeMs: 200, blunderProbability: 0.22, blunderMultiPv: 4 },
  1100: { targetElo: 1100, skillLevel: 6, depth: 5, movetimeMs: 300, blunderProbability: 0.14, blunderMultiPv: 3 },
  1300: { targetElo: 1300, skillLevel: 8, depth: 6, movetimeMs: 400, blunderProbability: 0.08, blunderMultiPv: 3 },
  1500: { targetElo: 1500, skillLevel: 11, depth: 8, movetimeMs: 600, blunderProbability: 0.04, blunderMultiPv: 2 },
  1700: { targetElo: 1700, skillLevel: 14, depth: 10, movetimeMs: 900, blunderProbability: 0.02, blunderMultiPv: 2 },
  1900: { targetElo: 1900, skillLevel: 17, depth: 12, movetimeMs: 1400, blunderProbability: 0, blunderMultiPv: 1 },
  2100: { targetElo: 2100, skillLevel: 20, depth: 14, movetimeMs: 2000, blunderProbability: 0, blunderMultiPv: 1 },
};

export const AVAILABLE_ELO_LEVELS: number[] = Object.keys(ELO_PROFILES)
  .map(Number)
  .sort((a, b) => a - b);

export function getProfile(targetElo: number): DifficultyProfile {
  const profile = ELO_PROFILES[targetElo];
  if (!profile) {
    throw new Error(`Unknown Elo level ${targetElo}. Available: ${AVAILABLE_ELO_LEVELS.join(", ")}`);
  }
  return profile;
}
