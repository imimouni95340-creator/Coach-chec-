import type { MoveOut } from "../types/game";

interface Props {
  moves: MoveOut[];
}

interface Row {
  number: number;
  white?: MoveOut;
  black?: MoveOut;
}

function toRows(moves: MoveOut[]): Row[] {
  const rows: Row[] = [];
  for (const move of moves) {
    const rowIndex = Math.floor((move.ply - 1) / 2);
    if (!rows[rowIndex]) rows[rowIndex] = { number: rowIndex + 1 };
    if (move.color === "white") rows[rowIndex].white = move;
    else rows[rowIndex].black = move;
  }
  return rows;
}

function MoveCell({ move }: { move?: MoveOut }) {
  if (!move) return <span className="move-cell empty" />;
  return (
    <span className="move-cell" title={move.thinking_time_ms != null ? `${move.thinking_time_ms} ms de réflexion` : undefined}>
      {move.san}
      {move.thinking_time_ms != null && (
        <span className="move-time">{(move.thinking_time_ms / 1000).toFixed(1)}s</span>
      )}
    </span>
  );
}

export function MoveHistory({ moves }: Props) {
  const rows = toRows(moves);
  return (
    <div className="move-history">
      <h3>Coups joués</h3>
      {rows.length === 0 ? (
        <p className="empty-hint">Aucun coup joué pour l'instant.</p>
      ) : (
        <ol className="move-list">
          {rows.map((row) => (
            <li key={row.number}>
              <span className="move-number">{row.number}.</span>
              <MoveCell move={row.white} />
              <MoveCell move={row.black} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
