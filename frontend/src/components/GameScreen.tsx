import { useEffect, useState } from "react";
import type { GameStateOut } from "../types/game";
import { api, ApiError } from "../api/client";
import { Board } from "./Board";
import { MoveHistory } from "./MoveHistory";
import { PlayerPanel } from "./PlayerPanel";
import { StatusBanner } from "./StatusBanner";

interface Props {
  game: GameStateOut;
  onGameUpdate: (game: GameStateOut) => void;
  onNewGame: () => void;
}

export function GameScreen({ game, onGameUpdate, onNewGame }: Props) {
  const [aiThinking, setAiThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);

  const aiToMove = !game.is_game_over && game.side_to_move === game.ai_color;

  useEffect(() => {
    if (!aiToMove) return;
    let cancelled = false;
    setAiThinking(true);
    api
      .playAiMove(game.id)
      .then((updated) => {
        if (!cancelled) onGameUpdate(updated);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Erreur lors du coup de l'IA.");
      })
      .finally(() => {
        if (!cancelled) setAiThinking(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiToMove, game.id, game.moves.length]);

  async function handleMove(uci: string) {
    setError(null);
    try {
      const updated = await api.makeMove(game.id, uci);
      onGameUpdate(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Coup refusé.");
    }
  }

  async function handleResign() {
    try {
      const updated = await api.resign(game.id, game.human_color);
      onGameUpdate(updated);
      setConfirmResign(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'abandonner.");
    }
  }

  const lastMove = game.moves.at(-1);
  const topColor = game.human_color === "white" ? game.ai_color : game.human_color;
  const bottomColor = game.human_color;

  return (
    <div className="game-screen">
      <div className="board-column">
        <PlayerPanel
          label={topColor === game.ai_color ? "Stockfish" : "Vous"}
          color={topColor}
          isAi={topColor === game.ai_color}
          aiElo={game.ai_elo}
          timeUsedMs={topColor === "white" ? game.white_time_used_ms : game.black_time_used_ms}
          isActive={!game.is_game_over && game.side_to_move === topColor}
        />

        <Board
          fen={game.fen}
          legalMoves={game.legal_moves}
          orientation={game.human_color}
          interactive={!game.is_game_over && game.side_to_move === game.human_color}
          lastMoveUci={lastMove?.uci}
          onMove={handleMove}
        />

        <PlayerPanel
          label={bottomColor === game.ai_color ? "Stockfish" : "Vous"}
          color={bottomColor}
          isAi={bottomColor === game.ai_color}
          aiElo={game.ai_elo}
          timeUsedMs={bottomColor === "white" ? game.white_time_used_ms : game.black_time_used_ms}
          isActive={!game.is_game_over && game.side_to_move === bottomColor}
        />

        {aiThinking && <div className="thinking-indicator">Stockfish réfléchit…</div>}
        <StatusBanner game={game} />
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="side-panel">
        <MoveHistory moves={game.moves} />

        <div className="game-controls">
          {!game.is_game_over && (
            <>
              {confirmResign ? (
                <div className="resign-confirm">
                  <p>Confirmer l'abandon ?</p>
                  <button className="danger-btn" onClick={handleResign}>
                    Oui, abandonner
                  </button>
                  <button onClick={() => setConfirmResign(false)}>Annuler</button>
                </div>
              ) : (
                <button className="danger-btn" onClick={() => setConfirmResign(true)}>
                  Abandonner
                </button>
              )}
            </>
          )}
          <button className="primary-btn" onClick={onNewGame}>
            Nouvelle partie
          </button>
        </div>
      </div>
    </div>
  );
}
