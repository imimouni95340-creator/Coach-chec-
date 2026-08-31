"""Calibration of Stockfish's playing strength against a target Elo rating.

IMPORTANT: this is a first, deliberately simple approximation. Stockfish 16's
own ``UCI_Elo`` option is only calibrated down to ~1320 Elo, so it cannot by
itself represent a "100 Elo" or "500 Elo" opponent. To cover the full range
requested (100..2100) we combine several independent levers:

- ``skill_level``       Stockfish's own 0-20 "Skill Level" knob. At low
                         values the engine deliberately restricts its search
                         and picks weaker moves.
- ``depth``/``movetime`` Hard search limits. A shallow, fast search plays
                         much more weakly than a deep one even at the same
                         skill level.
- ``uci_elo`` (+ limit)  When available (>=1320 target) we also enable
                         Stockfish's native strength limiter as a second,
                         independent constraint.
- ``blunder_probability``/``blunder_multipv``
                         For the weakest bots, Stockfish's own limiter still
                         plays too soundly. We occasionally replace the best
                         move with a randomly chosen move from the top-N
                         principal variations (or a random legal move) to
                         emulate human-like blunders.

None of these numbers are the product of statistical calibration (e.g. Elo
regression against real games) — they are a reasonable, documented starting
point meant to be tuned later once we can actually measure the resulting
playing strength (e.g. by running engine-vs-engine matches). Treat the Elo
label attached to each profile as a *target*, not a scientific guarantee.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DifficultyProfile:
    """A named, reproducible configuration of the chess engine's strength."""

    target_elo: int
    skill_level: int  # Stockfish "Skill Level" UCI option, 0-20
    depth: int | None  # Max search depth (None = no explicit cap)
    movetime_ms: int  # Time given to the engine to think, in milliseconds
    use_uci_limit_strength: bool  # Also enable Stockfish's own UCI_Elo limiter
    uci_elo: int | None  # Value passed to UCI_Elo when the above is True
    blunder_probability: float  # 0..1 chance of playing a deliberately weaker move
    blunder_multipv: int  # How many top candidate moves to choose a "blunder" from

    def label(self) -> str:
        return f"{self.target_elo} Elo"


# Stockfish 16 refuses UCI_Elo below 1320, so profiles under that target rely
# purely on skill_level + depth/movetime + blunder injection.
_MIN_NATIVE_UCI_ELO = 1320

ELO_PROFILES: dict[int, DifficultyProfile] = {
    100: DifficultyProfile(100, skill_level=0, depth=1, movetime_ms=50,
                            use_uci_limit_strength=False, uci_elo=None,
                            blunder_probability=0.75, blunder_multipv=6),
    300: DifficultyProfile(300, skill_level=1, depth=1, movetime_ms=80,
                            use_uci_limit_strength=False, uci_elo=None,
                            blunder_probability=0.60, blunder_multipv=6),
    500: DifficultyProfile(500, skill_level=2, depth=2, movetime_ms=100,
                            use_uci_limit_strength=False, uci_elo=None,
                            blunder_probability=0.45, blunder_multipv=5),
    700: DifficultyProfile(700, skill_level=4, depth=3, movetime_ms=150,
                            use_uci_limit_strength=False, uci_elo=None,
                            blunder_probability=0.32, blunder_multipv=4),
    900: DifficultyProfile(900, skill_level=6, depth=4, movetime_ms=200,
                            use_uci_limit_strength=False, uci_elo=None,
                            blunder_probability=0.22, blunder_multipv=4),
    1100: DifficultyProfile(1100, skill_level=8, depth=5, movetime_ms=300,
                             use_uci_limit_strength=False, uci_elo=None,
                             blunder_probability=0.14, blunder_multipv=3),
    1300: DifficultyProfile(1300, skill_level=10, depth=6, movetime_ms=400,
                             use_uci_limit_strength=False, uci_elo=None,
                             blunder_probability=0.08, blunder_multipv=3),
    1500: DifficultyProfile(1500, skill_level=12, depth=8, movetime_ms=500,
                             use_uci_limit_strength=True, uci_elo=1500,
                             blunder_probability=0.04, blunder_multipv=2),
    1700: DifficultyProfile(1700, skill_level=15, depth=10, movetime_ms=700,
                             use_uci_limit_strength=True, uci_elo=1700,
                             blunder_probability=0.02, blunder_multipv=2),
    1900: DifficultyProfile(1900, skill_level=18, depth=13, movetime_ms=900,
                             use_uci_limit_strength=True, uci_elo=1900,
                             blunder_probability=0.0, blunder_multipv=1),
    2100: DifficultyProfile(2100, skill_level=20, depth=16, movetime_ms=1200,
                             use_uci_limit_strength=True, uci_elo=2100,
                             blunder_probability=0.0, blunder_multipv=1),
}

AVAILABLE_ELO_LEVELS: list[int] = sorted(ELO_PROFILES.keys())


def get_profile(target_elo: int) -> DifficultyProfile:
    try:
        return ELO_PROFILES[target_elo]
    except KeyError as exc:
        raise ValueError(
            f"Unknown Elo level {target_elo}. Available levels: {AVAILABLE_ELO_LEVELS}"
        ) from exc
