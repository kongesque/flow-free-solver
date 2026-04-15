import React, { useState, useCallback, useEffect, useRef } from 'react';
import { savePuzzleState, loadPuzzleState, clearPuzzleState } from '@/hooks/useStorage';
import { Loader2, X, Check, ChevronDown } from 'lucide-react';

const GitHubIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
    </svg>
);

const FlowSolver = () => {
    const defaultSize = 5;
    const sizeOptions = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const RESTRICT_Z3_TO_LARGE_GRIDS = false;

    // color palette
    const COLORS: Record<number, string> = {
        1: '#FF0000',  // R - Red
        2: '#0000FF',  // B - Blue
        3: '#FFFF00',  // Y - Yellow
        4: '#008000',  // G - Green
        5: '#FFA500',  // O - Orange
        6: '#00FFFF',  // C - Cyan
        7: '#FF00FF',  // M - Magenta
        8: '#800000',  // m - Maroon
        9: '#800080',  // P - Purple
        10: '#808080', // A - Gray
        11: '#FFFFFF', // W - White
        12: '#00FF00', // g - Bright Green
        13: '#D2B48C', // T - Tan
        14: '#00008B', // b - Dark Blue
        15: '#008B8B', // c - Dark Cyan
        16: '#FFC0CB', // p - Pink
    };

    const initializeBoard = (boardSize: number) => {
        return Array(boardSize).fill(null).map(() => Array(boardSize).fill(0));
    };

    const [size, setSize] = useState(defaultSize);
    const [board, setBoard] = useState<number[][]>(() => initializeBoard(defaultSize));
    const [solvedBoard, setSolvedBoard] = useState<number[][] | null>(null);

    // UX: Track current color being placed and whether we're placing first or second endpoint
    const [activeColor, setActiveColor] = useState(1);
    const [isPlacingSecond, setIsPlacingSecond] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSolving, setIsSolving] = useState(false);
    const [solverType, setSolverType] = useState<'astar' | 'z3' | 'heuristic_bfs'>('heuristic_bfs');

    const [solveTime, setSolveTime] = useState<number | null>(null);

    // Prevent hover preview flash during reset
    const [isResetting, setIsResetting] = useState(false);

    // IndexedDB: Track if initial load is complete
    const [isLoaded, setIsLoaded] = useState(false);
    const saveTimeoutRef = useRef<number | null>(null);

    // Load saved state on mount
    useEffect(() => {
        loadPuzzleState().then((saved) => {
            if (saved) {
                setSize(saved.size);
                setBoard(saved.board);
                setSolverType(saved.solverType);
                setActiveColor(saved.activeColor);
                setIsPlacingSecond(saved.isPlacingSecond);
            }
            setIsLoaded(true);
        });
    }, []);

    // Auto-save state on changes (debounced 500ms)
    useEffect(() => {
        if (!isLoaded) return; // Don't save until initial load is complete

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            savePuzzleState({
                size,
                board,
                solverType,
                activeColor,
                isPlacingSecond,
            });
        }, 500);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [size, board, solverType, activeColor, isPlacingSecond, isLoaded]);

    const resetBoard = useCallback((newSize: number = size) => {
        // Prevent hover preview flash by setting isResetting before state changes
        setIsResetting(true);
        setBoard(initializeBoard(newSize));
        setSolvedBoard(null);
        setActiveColor(1);
        setIsPlacingSecond(false);
        setError(null);
        setSolveTime(null);
        // Clear saved state on reset
        clearPuzzleState();
        // Re-enable hover preview after React has completed the render cycle
        requestAnimationFrame(() => setIsResetting(false));
    }, [size]);

    const handleSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newSize = parseInt(event.target.value);
        setSize(newSize);

        // Z3 is only for 15x15. If switching to smaller, auto-switch to heuristic
        if (RESTRICT_Z3_TO_LARGE_GRIDS && newSize !== 15 && solverType === 'z3') {
            setSolverType('heuristic_bfs');
        }

        resetBoard(newSize);
    };

    // Helper: count occurrences of a color on the board
    const countColor = (board: number[][], color: number) =>
        board.flat().filter(c => c === color).length;

    // UX Best Practices:
    // 1. Simple mental model: Click empty = place, Click filled = remove
    // 2. Clear feedback: Show which color is being placed
    // 3. Predictable: Same action = same result
    // 4. Forgiving: Easy to undo mistakes
    const handleCellClick = useCallback((x: number, y: number) => {
        if (solvedBoard) return;

        const cellValue = board[x][y];
        const newBoard = board.map(row => [...row]);

        if (cellValue !== 0) {
            // REMOVE: Clicking a filled cell removes it
            newBoard[x][y] = 0;

            // Determine how many of this color remain
            const remaining = countColor(newBoard, cellValue);

            if (remaining === 1) {
                // One endpoint left - switch to complete this pair
                setActiveColor(cellValue);
                setIsPlacingSecond(true);
            } else if (remaining === 0) {
                // Both removed - find the lowest incomplete color
                let lowestIncomplete = 1;
                while (countColor(newBoard, lowestIncomplete) === 2) {
                    lowestIncomplete++;
                }
                setActiveColor(lowestIncomplete);
                setIsPlacingSecond(countColor(newBoard, lowestIncomplete) === 1);
            }
            // If remaining === 2 (impossible here) or other cases, don't change active color
        } else {
            // PLACE: Clicking empty cell places the active color
            // BUG FIX: Check if this color already has 2 endpoints
            const currentCount = countColor(board, activeColor);
            if (currentCount >= 2) {
                // Color is complete - find next available
                let nextColor = activeColor;
                while (countColor(board, nextColor) >= 2 && nextColor <= 16) {
                    nextColor++;
                }
                if (nextColor > 16) return; // All colors placed
                setActiveColor(nextColor);
                setIsPlacingSecond(countColor(board, nextColor) === 1);
                return; // Don't place yet, let user click again with updated color
            }

            newBoard[x][y] = activeColor;

            if (currentCount === 1) {
                // This was the 2nd endpoint - advance to next color
                let nextColor = activeColor + 1;
                while (countColor(newBoard, nextColor) >= 2 && nextColor <= 16) {
                    nextColor++;
                }
                setActiveColor(nextColor);
                setIsPlacingSecond(false);
            } else {
                // This was the 1st endpoint
                setIsPlacingSecond(true);
            }
        }

        setBoard(newBoard);
    }, [board, solvedBoard, activeColor]);



    const workerRef = useRef<Worker | null>(null);

    // Cleanup worker on unmount
    useEffect(() => {
        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
            }
        };
    }, []);

    const solveBoard = async () => {
        // Clear any previous error and set loading
        setError(null);
        setIsSolving(true);

        // Terminate existing worker if any
        if (workerRef.current) {
            workerRef.current.terminate();
        }

        // Use Web Worker to run solver in background thread
        // This keeps CSS animations responsive
        const worker = new Worker(
            new URL('../workers/solver.worker.ts', import.meta.url),
            { type: 'module' }
        );
        workerRef.current = worker;

        const startTime = performance.now();

        worker.postMessage({ board, type: solverType });

        worker.onmessage = (event) => {
            const result = event.data;
            setIsSolving(false);
            workerRef.current = null;
            worker.terminate();

            if (result.board) {
                const endTime = performance.now();
                setSolveTime(endTime - startTime);
                setSolvedBoard(result.board);
            } else if (result.timedOut) {
                // Customized timeout error
                if (solverType === 'astar') {
                    setError('Timed out. Try Heuristic BFS.');
                } else {
                    setError('Timed out (15s limit)');
                }
                setTimeout(() => setError(null), 4000);
            } else if (result.error) {
                setError('Solver error: ' + result.error);
                setTimeout(() => setError(null), 3000);
            } else {
                // No solution found
                if (solverType === 'heuristic_bfs' && size === 15) {
                    setError('No solution. Try Z3.');
                } else {
                    setError('No solution found');
                }
                // Auto-dismiss error after 3 seconds
                setTimeout(() => setError(null), 3000);
            }
        };

        worker.onerror = (error) => {
            console.error('Worker error:', error);
            setIsSolving(false);
            setError('Solver error. Please try again.');
            setTimeout(() => setError(null), 3000);
            setTimeout(() => setError(null), 3000);
            workerRef.current = null;
            worker.terminate();
        };
    };

    // Declarative Board Rendering
    const currentBoard = solvedBoard || board;

    return (

        <main className='relative flex flex-col justify-center items-center h-[100dvh] w-full bg-stoic-bg safe-area-inset touch-manipulation overflow-hidden gap-3'>
            <a
                href="https://github.com/Kongesque/flow-free-solver"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-4 right-4 sm:top-6 sm:right-6 text-stoic-secondary hover:text-stoic-primary transition-colors z-50 p-2"
                aria-label="View source on GitHub"
            >
                <GitHubIcon className="size-8" />
            </a>
            {/* Header with clear hierarchy */}
            <header className='text-center flex flex-col items-center gap-1 selectable-text shrink-0 mb-2'>
                <h1
                    className='text-stoic-primary text-xl sm:text-2xl md:text-3xl lg:text-4xl uppercase tracking-[0.1em]'
                    style={{ fontFamily: 'Geist Pixel Circle' }}
                >
                    Flow Free Solver
                </h1>
                <p className="text-stoic-secondary text-xs mt-1 mx-4">
                    <strong className="text-stoic-primary">Tips:</strong> Click to place endpoints, click again to remove.
                </p>
            </header>

            {/* Grid - Core Interaction Area */}
            <article
                aria-label="Puzzle Grid Board"
                className="grid bg-stoic-line border-2 border-stoic-line mx-auto shrink-0"
                style={{
                    gap: '2px',
                    gridTemplateColumns: `repeat(${size}, 1fr)`,
                    gridTemplateRows: `repeat(${size}, 1fr)`,
                    width: 'min(90vw, 55vh)',
                    height: 'min(90vw, 55vh)'
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
                                onClick={() => !solvedBoard && handleCellClick(x, y)}
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

            {/* Controls & Status Section */}
            <section aria-label="Game Controls" className="flex flex-col items-center gap-3 shrink-0 z-10">
                {/* Status indicator - contextual feedback */}
                <div role="status" className='flex items-center gap-3 min-h-[28px] selectable-text'>
                    {isSolving ? (
                        <span className='text-stoic-accent text-sm uppercase tracking-widest font-semibold flex items-center gap-2'>
                            <Loader2 className="animate-spin h-4 w-4" aria-hidden="true" />
                            Solving…
                        </span>
                    ) : error ? (
                        <span className='text-sm uppercase tracking-widest font-semibold animate-pulse flex items-center gap-2'
                            style={{ color: '#FF3B30' }}
                        >
                            <X className="h-4 w-4" /> {error}
                        </span>
                    ) : solvedBoard ? (
                        <span className='text-stoic-accent text-sm uppercase tracking-widest font-semibold flex items-center gap-2'>
                            <Check className="h-4 w-4" /> Solved
                            {solveTime !== null && (
                                <span className="text-stoic-secondary text-xs opacity-75">
                                    ({solveTime < 1000 ? `${Math.round(solveTime)}ms` : `${(solveTime / 1000).toFixed(2)}s`})
                                </span>
                            )}
                        </span>
                    ) : (
                        <div className='flex items-center gap-3'>
                            <span className='text-stoic-primary text-sm uppercase tracking-wider font-medium'>Place</span>
                            <div className="flex items-center gap-3">
                                <span
                                    className="w-4 h-4 rounded-full"
                                    style={{ backgroundColor: COLORS[activeColor] || '#888' }}
                                />
                                <span className='text-stoic-primary text-sm uppercase tracking-wider font-medium'>
                                    {isPlacingSecond ? 'End' : 'Start'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Controls - responsive layout */}
                <div className="flex flex-wrap items-center justify-center gap-3 mb-2">
                    <div className="relative">
                        <select
                            className='h-9 sm:h-10 pl-3 pr-7 text-xs border border-stoic-line bg-stoic-bg text-stoic-primary uppercase tracking-wide focus:outline-none focus:border-stoic-accent cursor-pointer appearance-none rounded-md'
                            value={size}
                            onChange={handleSizeChange}
                            aria-label="Grid Size"
                        >
                            {sizeOptions.map(option => (
                                <option key={option} value={option}>{option}×{option}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-stoic-secondary pointer-events-none h-3 w-3" />
                    </div>

                    <div className="relative">
                        <select
                            className='h-9 sm:h-10 pl-3 pr-7 text-xs border border-stoic-line bg-stoic-bg text-stoic-primary uppercase tracking-wide focus:outline-none focus:border-stoic-accent cursor-pointer appearance-none rounded-md'
                            value={solverType}
                            onChange={(e) => {
                                const newType = e.target.value as 'astar' | 'z3' | 'heuristic_bfs';
                                if (RESTRICT_Z3_TO_LARGE_GRIDS && newType === 'z3' && size !== 15) {
                                    // Prevent selection and show error
                                    setError('Z3 is for 15x15 only');
                                    setTimeout(() => setError(null), 2000);
                                    setSolverType('heuristic_bfs');
                                    return;
                                }
                                setSolverType(newType);
                            }}
                            aria-label="Solver Algorithm"
                        >
                            <option value="astar">A*</option>
                            <option value="z3">SAT (Z3)</option>
                            <option value="heuristic_bfs">Heuristic BFS</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-stoic-secondary pointer-events-none h-3 w-3" />
                    </div>

                    <button
                        className='h-9 sm:h-10 px-4 text-xs border-2 border-stoic-accent bg-stoic-accent text-stoic-bg font-bold uppercase tracking-wider hover:bg-transparent hover:text-stoic-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-stoic-accent disabled:hover:text-stoic-bg select-none flex items-center gap-2 rounded-md'
                        onClick={solveBoard}
                        disabled={isSolving}
                    >
                        {isSolving && (
                            <Loader2 className="animate-spin h-3 w-3" aria-hidden="true" />
                        )}
                        {isSolving ? 'Solving' : 'Solve'}
                    </button>

                    <button
                        className='h-9 sm:h-10 px-3 text-xs border border-stoic-line bg-transparent text-stoic-secondary uppercase tracking-wider hover:border-stoic-secondary hover:text-stoic-primary transition-colors select-none rounded-md'
                        onClick={() => resetBoard()}
                    >
                        Reset
                    </button>
                </div>
            </section>

            <footer className="px-6 max-w-lg text-center text-stoic-secondary text-xs leading-relaxed selectable-text shrink-0">
                <p>
                    Solve any Flow Free or Numberlink puzzle instantly.
                    <br className="hidden sm:block" />
                    Powered by C++ Heuristic BFS, SAT (Z3) & A* search.{' '}
                    <a href="https://www.kongesque.com/blog/flow-free-solver" target="_blank" rel="noopener noreferrer" className="hover:text-stoic-primary underline transition-colors">
                        Read more
                    </a>
                </p>
            </footer>
        </main>
    );

};

export default FlowSolver;
