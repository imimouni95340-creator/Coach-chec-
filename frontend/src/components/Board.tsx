import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { PlayerColor } from "../types/game";

interface Props {
  fen: string;
  legalMoves: string[];
  orientation: PlayerColor;
  interactive: boolean;
  lastMoveUci?: string;
  onMove: (uci: string) => void;
}

const PROMOTION_CHOICES: { code: string; label: string }[] = [
  { code: "q", label: "♕ Dame" },
  { code: "r", label: "♖ Tour" },
  { code: "b", label: "♗ Fou" },
  { code: "n", label: "♘ Cavalier" },
];

export function Board({ fen, legalMoves, orientation, interactive, lastMoveUci, onMove }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);

  const targetsFor = useMemo(() => {
    return (source: string) =>
      legalMoves.filter((m) => m.startsWith(source)).map((m) => m.slice(2, 4));
  }, [legalMoves]);

  const sourcesWithMoves = useMemo(() => new Set(legalMoves.map((m) => m.slice(0, 2))), [legalMoves]);

  function resolveAndPlay(from: string, to: string) {
    const candidates = legalMoves.filter((m) => m.startsWith(from) && m.slice(2, 4) === to);
    if (candidates.length === 0) return false;
    if (candidates.length === 1) {
      onMove(candidates[0]);
    } else {
      // Multiple candidates only happens for pawn promotion (one per piece choice).
      setPendingPromotion({ from, to });
    }
    setSelected(null);
    return true;
  }

  function handleSquareClick(square: string) {
    if (!interactive) return;
    if (selected) {
      if (square === selected) {
        setSelected(null);
        return;
      }
      const played = resolveAndPlay(selected, square);
      if (played) return;
      if (sourcesWithMoves.has(square)) {
        setSelected(square);
      } else {
        setSelected(null);
      }
    } else if (sourcesWithMoves.has(square)) {
      setSelected(square);
    }
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (selected) {
    squareStyles[selected] = { backgroundColor: "rgba(255, 214, 51, 0.55)" };
    for (const target of targetsFor(selected)) {
      squareStyles[target] = {
        background:
          "radial-gradient(circle, rgba(0,0,0,0.28) 22%, transparent 26%)",
      };
    }
  }
  if (lastMoveUci) {
    const from = lastMoveUci.slice(0, 2);
    const to = lastMoveUci.slice(2, 4);
    squareStyles[from] = { ...squareStyles[from], backgroundColor: "rgba(90, 170, 255, 0.35)" };
    squareStyles[to] = { ...squareStyles[to], backgroundColor: "rgba(90, 170, 255, 0.35)" };
  }

  return (
    <div className="board-wrapper">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: interactive,
          showAnimations: true,
          squareStyles,
          onSquareClick: ({ square }) => handleSquareClick(square),
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!interactive || !targetSquare) return false;
            return resolveAndPlay(sourceSquare, targetSquare);
          },
          darkSquareStyle: { backgroundColor: "#7c9473" },
          lightSquareStyle: { backgroundColor: "#eeeed2" },
        }}
      />

      {pendingPromotion && (
        <div className="promotion-overlay">
          <div className="promotion-card">
            <p>Promouvoir en :</p>
            <div className="promotion-choices">
              {PROMOTION_CHOICES.map((choice) => (
                <button
                  key={choice.code}
                  onClick={() => {
                    onMove(`${pendingPromotion.from}${pendingPromotion.to}${choice.code}`);
                    setPendingPromotion(null);
                  }}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
