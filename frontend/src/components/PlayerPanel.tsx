import type { PlayerColor } from "../types/game";

interface Props {
  label: string;
  color: PlayerColor;
  isAi: boolean;
  aiElo?: number;
  timeUsedMs: number;
  isActive: boolean;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function PlayerPanel({ label, color, isAi, aiElo, timeUsedMs, isActive }: Props) {
  return (
    <div className={`player-panel ${isActive ? "active" : ""}`}>
      <div className="player-info">
        <span className={`piece-glyph ${color}`}>{color === "white" ? "♔" : "♚"}</span>
        <div>
          <div className="player-name">{label}</div>
          {isAi && aiElo != null && <div className="player-sub">Stockfish · {aiElo} Elo</div>}
        </div>
      </div>
      <div className="player-clock">{formatDuration(timeUsedMs)}</div>
    </div>
  );
}
