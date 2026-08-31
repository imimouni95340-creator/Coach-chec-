import type { GameStateOut } from "../types/game";

function statusMessage(game: GameStateOut): string | null {
  const humanWon =
    (game.result === "1-0" && game.human_color === "white") ||
    (game.result === "0-1" && game.human_color === "black");

  switch (game.status) {
    case "in_progress":
      return null;
    case "checkmate":
      return humanWon ? "Échec et mat — vous gagnez !" : "Échec et mat — l'IA gagne.";
    case "stalemate":
      return "Pat — partie nulle.";
    case "draw_insufficient_material":
      return "Nulle — matériel insuffisant.";
    case "draw_fifty_moves":
      return "Nulle — règle des 50 coups.";
    case "draw_threefold_repetition":
      return "Nulle — répétition de position.";
    case "resigned":
      return humanWon ? "Votre adversaire a abandonné — vous gagnez !" : "Vous avez abandonné la partie.";
    default:
      return null;
  }
}

export function StatusBanner({ game }: { game: GameStateOut }) {
  const message = statusMessage(game);
  if (!message) {
    const inCheck = game.moves.at(-1)?.is_check;
    if (!inCheck) return null;
    return <div className="status-banner check">Échec !</div>;
  }
  return <div className="status-banner over">{message}</div>;
}
