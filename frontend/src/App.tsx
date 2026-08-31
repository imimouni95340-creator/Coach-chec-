import { useEffect, useState } from "react";
import type { GameStateOut, PlayerColor } from "./types/game";
import { api, warmUpEngine } from "./game/localGameApi";
import { SetupScreen } from "./components/SetupScreen";
import { GameScreen } from "./components/GameScreen";
import "./App.css";

function App() {
  const [game, setGame] = useState<GameStateOut | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Boot Stockfish while the player is still choosing colour and level, so the
  // engine's first move isn't delayed by worker startup.
  useEffect(() => {
    warmUpEngine();
  }, []);

  async function handleStart(color: PlayerColor, elo: number) {
    setStarting(true);
    setError(null);
    try {
      const created = await api.createGame(color, elo);
      setGame(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de démarrer la partie.");
    } finally {
      setStarting(false);
    }
  }

  function handleNewGame() {
    setGame(null);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="logo-glyph">♞</span>
        <span>Coach d'Échecs IA</span>
      </header>
      <main>
        {game ? (
          <GameScreen game={game} onGameUpdate={setGame} onNewGame={handleNewGame} />
        ) : (
          <SetupScreen onStart={handleStart} starting={starting} error={error} />
        )}
      </main>
    </div>
  );
}

export default App;
