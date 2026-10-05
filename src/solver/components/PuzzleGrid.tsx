import type { CSSProperties } from 'react';
import { COLORS } from './constants';

interface PuzzleGridProps {
    width: number;
    height: number;
    currentBoard: number[][];
    solvedBoard: number[][] | null;
    isSolving: boolean;
    activeColor: number;
    isResetting: boolean;
    onCellClick: (x: number, y: number) => void;
}

const PuzzleGrid = ({
    width,
    height,
    currentBoard,
    solvedBoard,
    isSolving,
    activeColor,
    isResetting,
    onCellClick,
}: PuzzleGridProps) => (
    <article
        aria-label="Puzzle Grid Board"
        className="puzzle-grid"
        style={{
            gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${height}, minmax(0, 1fr))`,
            '--board-ratio': width / height,
            '--mobile-board-height': height > width ? 'min(60svh, 520px)' : 'clamp(240px, 38svh, 400px)',
            aspectRatio: `${width} / ${height}`,
        } as CSSProperties}
    >
        {Array.from({ length: height }).map((_, y) =>
            Array.from({ length: width }).map((_, x) => {
                const cellValue = currentBoard[x]?.[y] ?? 0;
                const hasColor = cellValue !== 0;

                return (
                    <button
                        key={`${x}-${y}`}
                        type="button"
                        disabled={isSolving}
                        className={`
                            group
                            w-full h-full min-w-0 min-h-0
                            bg-stoic-block-bg
                            p-0 m-0 appearance-none cursor-pointer 
                            flex items-center justify-center 
                            transition-all duration-150
                            touch-manipulation
                            select-none
                            ${solvedBoard ? 'cursor-default' : 'hover:bg-stoic-block-hover active:scale-95 active:bg-stoic-block-hover'}
                        `}
                        onClick={() => !solvedBoard && onCellClick(x, y)}
                        aria-label={`Cell ${x},${y} ${hasColor ? `Color ${cellValue}` : 'Empty'}`}
                    >
                        {hasColor ? (
                            <span
                                className="endpoint-dot rounded-full w-[66%] h-[66%]"
                                style={{ backgroundColor: COLORS[cellValue] || '#888' }}
                            />
                        ) : !solvedBoard && !isResetting && (
                            <span
                                className="rounded-full w-[66%] h-[66%] opacity-0 group-hover:opacity-40 transition-opacity duration-75"
                                style={{ backgroundColor: COLORS[activeColor] || '#888' }}
                            />
                        )}
                    </button>
                );
            })
        )}
    </article>
);

export default PuzzleGrid;
