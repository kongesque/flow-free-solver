import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
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
}: PuzzleGridProps) => {
    const gridRef = useRef<HTMLElement>(null);
    const [focusedCell, setFocusedCell] = useState(0);
    const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, x: number, y: number) => {
        let nextX = x;
        let nextY = y;
        switch (event.key) {
            case 'ArrowLeft': nextX = Math.max(0, x - 1); break;
            case 'ArrowRight': nextX = Math.min(width - 1, x + 1); break;
            case 'ArrowUp': nextY = Math.max(0, y - 1); break;
            case 'ArrowDown': nextY = Math.min(height - 1, y + 1); break;
            case 'Home': nextX = 0; break;
            case 'End': nextX = width - 1; break;
            default: return;
        }
        event.preventDefault();
        const index = nextY * width + nextX;
        setFocusedCell(index);
        gridRef.current?.querySelectorAll('button')[index]?.focus();
    };
    return (
    <article
        ref={gridRef}
        aria-label="Puzzle Grid Board"
        aria-describedby="board-instructions board-keyboard-help"
        className="puzzle-grid"
        style={{
            gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${height}, minmax(0, 1fr))`,
            '--board-ratio': width / height,
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
                        disabled={isSolving || solvedBoard !== null}
                        tabIndex={y * width + x === Math.min(focusedCell, width * height - 1) ? 0 : -1}
                        onFocus={() => setFocusedCell(y * width + x)}
                        onKeyDown={event => moveFocus(event, x, y)}
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
                                className="endpoint-preview rounded-full w-[66%] h-[66%] transition-opacity duration-75"
                                style={{ backgroundColor: COLORS[activeColor] || '#888' }}
                            />
                        )}
                    </button>
                );
            })
        )}
    </article>
);
};

export default PuzzleGrid;
