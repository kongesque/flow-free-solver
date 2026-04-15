import { COLORS } from './constants';

interface PuzzleGridProps {
    size: number;
    currentBoard: number[][];
    solvedBoard: number[][] | null;
    activeColor: number;
    isResetting: boolean;
    onCellClick: (x: number, y: number) => void;
}

const PuzzleGrid = ({
    size,
    currentBoard,
    solvedBoard,
    activeColor,
    isResetting,
    onCellClick,
}: PuzzleGridProps) => (
    <article
        aria-label="Puzzle Grid Board"
        className="grid bg-stoic-line border-2 border-stoic-line mx-auto shrink-0"
        style={{
            gap: '2px',
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gridTemplateRows: `repeat(${size}, 1fr)`,
            width: 'min(90vw, 55vh)',
            height: 'min(90vw, 55vh)',
        }}
    >
        {Array.from({ length: size }).map((_, y) =>
            Array.from({ length: size }).map((_, x) => {
                const cellValue = currentBoard[x]?.[y] ?? 0;
                const hasColor = cellValue !== 0;

                return (
                    <button
                        key={`${x}-${y}`}
                        type="button"
                        className={`
                            group
                            w-full h-full
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
                                className="rounded-full w-[70%] h-[70%]"
                                style={{ backgroundColor: COLORS[cellValue] || '#888' }}
                            />
                        ) : !solvedBoard && !isResetting && (
                            <span
                                className="rounded-full w-[70%] h-[70%] opacity-0 group-hover:opacity-50 transition-opacity duration-75"
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
