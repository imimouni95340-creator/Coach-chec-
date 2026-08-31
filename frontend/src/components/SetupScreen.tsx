import { useEffect, useState } from "react";
import type { DifficultyLevelOut, PlayerColor } from "../types/game";
import { api } from "../game/localGameApi";

interface Props {
  onStart: (color: PlayerColor, elo: number) => void;
  starting: boolean;
  error: string | null;
}

export function SetupScreen({ onStart, starting, error }: Props) {
  const [levels, setLevels] = useState<DifficultyLevelOut[]>([]);
  const [color, setColor] = useState<PlayerColor>("white");
  const [elo, setElo] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getDifficultyLevels()
      .then((data) => {
        setLevels(data);
        setElo(data[Math.floor(data.length / 2)]?.target_elo ?? data[0]?.target_elo ?? null);
      })
      .catch(() => setLoadError("Impossible de charger les niveaux de difficulté."));
  }, []);

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1>Coach d'Échecs IA</h1>
        <p className="subtitle">Choisissez votre camp et le niveau de l'adversaire pour commencer.</p>

        <section className="setup-section">
          <h2>Votre camp</h2>
          <div className="color-choice">
            <button
              className={`color-btn ${color === "white" ? "selected" : ""}`}
              onClick={() => setColor("white")}
            >
              <span className="piece-glyph">♔</span>
              Blancs
            </button>
            <button
              className={`color-btn ${color === "black" ? "selected" : ""}`}
              onClick={() => setColor("black")}
            >
              <span className="piece-glyph">♚</span>
              Noirs
            </button>
          </div>
        </section>

        <section className="setup-section">
          <h2>Niveau de l'IA</h2>
          {loadError && <p className="error-text">{loadError}</p>}
          <div className="elo-grid">
            {levels.map((lvl) => (
              <button
                key={lvl.target_elo}
                className={`elo-btn ${elo === lvl.target_elo ? "selected" : ""}`}
                onClick={() => setElo(lvl.target_elo)}
              >
                {lvl.target_elo}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="error-text">{error}</p>}

        <button
          className="start-btn"
          disabled={elo === null || starting}
          onClick={() => elo !== null && onStart(color, elo)}
        >
          {starting ? "Démarrage..." : "Commencer la partie"}
        </button>
      </div>
    </div>
  );
}
