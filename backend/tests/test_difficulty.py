from app.engine.difficulty import AVAILABLE_ELO_LEVELS, ELO_PROFILES, get_profile


def test_all_eleven_levels_present():
    assert AVAILABLE_ELO_LEVELS == [100, 300, 500, 700, 900, 1100, 1300, 1500, 1700, 1900, 2100]
    assert len(ELO_PROFILES) == 11


def test_get_profile_returns_matching_elo():
    for elo in AVAILABLE_ELO_LEVELS:
        profile = get_profile(elo)
        assert profile.target_elo == elo


def test_unknown_elo_raises():
    import pytest

    with pytest.raises(ValueError):
        get_profile(9999)


def test_skill_level_increases_with_target_elo():
    levels = [get_profile(elo).skill_level for elo in AVAILABLE_ELO_LEVELS]
    assert levels == sorted(levels)


def test_blunder_probability_decreases_with_target_elo():
    probs = [get_profile(elo).blunder_probability for elo in AVAILABLE_ELO_LEVELS]
    assert probs == sorted(probs, reverse=True)


def test_native_uci_elo_only_used_above_stockfish_floor():
    for elo in AVAILABLE_ELO_LEVELS:
        profile = get_profile(elo)
        if profile.use_uci_limit_strength:
            assert profile.uci_elo is not None
            assert profile.uci_elo >= 1320
