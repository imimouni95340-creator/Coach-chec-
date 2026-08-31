from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_difficulty_levels_endpoint_lists_eleven_levels():
    resp = client.get("/api/difficulty-levels")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 11
    assert {d["target_elo"] for d in data} == {100, 300, 500, 700, 900, 1100, 1300, 1500, 1700, 1900, 2100}


def test_cors_allows_a_private_lan_origin():
    """A phone on the same Wi-Fi must be able to call the API from the browser."""
    resp = client.get("/api/difficulty-levels", headers={"Origin": "http://192.168.1.42:5173"})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://192.168.1.42:5173"


def test_cors_rejects_a_public_origin():
    resp = client.get("/api/difficulty-levels", headers={"Origin": "http://evil.example.com"})
    assert "access-control-allow-origin" not in resp.headers


def test_create_game_rejects_unknown_elo():
    resp = client.post("/api/games", json={"human_color": "white", "ai_elo": 42})
    assert resp.status_code == 422


def test_full_game_flow_human_white_vs_ai():
    # 1. Create a game as White vs a fast, weak AI.
    resp = client.post("/api/games", json={"human_color": "white", "ai_elo": 100})
    assert resp.status_code == 200
    game = resp.json()
    game_id = game["id"]
    assert game["side_to_move"] == "white"
    assert game["is_game_over"] is False
    assert "e2e4" in game["legal_moves"]

    # 2. Human plays e4.
    resp = client.post(f"/api/games/{game_id}/moves", json={"uci": "e2e4"})
    assert resp.status_code == 200
    state = resp.json()
    assert state["moves"][-1]["san"] == "e4"
    assert state["side_to_move"] == "black"

    # 3. Ask the AI (Stockfish) to reply.
    resp = client.post(f"/api/games/{game_id}/ai-move")
    assert resp.status_code == 200
    state = resp.json()
    assert len(state["moves"]) == 2
    assert state["moves"][-1]["color"] == "black"
    assert state["moves"][-1]["thinking_time_ms"] is not None
    assert state["side_to_move"] == "white"

    # 4. An illegal move is rejected with 400.
    resp = client.post(f"/api/games/{game_id}/moves", json={"uci": "e2e4"})
    assert resp.status_code == 400

    # 5. Resigning ends the game and it gets persisted.
    resp = client.post(f"/api/games/{game_id}/resign", json={"resigning_color": "white"})
    assert resp.status_code == 200
    state = resp.json()
    assert state["status"] == "resigned"
    assert state["result"] == "0-1"

    resp = client.get("/api/saved-games")
    assert resp.status_code == 200
    saved_ids = [g["id"] for g in resp.json()]
    assert game_id in saved_ids

    resp = client.get(f"/api/saved-games/{game_id}")
    assert resp.status_code == 200
    saved = resp.json()
    assert "1. e4" in saved["pgn"]
    assert saved["result"] == "0-1"

    # 6. Further moves on a finished game are rejected.
    resp = client.post(f"/api/games/{game_id}/moves", json={"uci": "a2a3"})
    assert resp.status_code == 409


def test_ai_move_rejected_when_not_ai_turn():
    resp = client.post("/api/games", json={"human_color": "white", "ai_elo": 500})
    game_id = resp.json()["id"]
    resp = client.post(f"/api/games/{game_id}/ai-move")
    assert resp.status_code == 409


def test_ai_plays_first_when_human_is_black():
    resp = client.post("/api/games", json={"human_color": "black", "ai_elo": 100})
    game = resp.json()
    game_id = game["id"]
    assert game["side_to_move"] == "white"
    assert game["ai_color"] == "white"

    resp = client.post(f"/api/games/{game_id}/ai-move")
    assert resp.status_code == 200
    state = resp.json()
    assert len(state["moves"]) == 1
    assert state["side_to_move"] == "black"
