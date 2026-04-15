import React, { useState, useCallback, useEffect, useRef } from 'react';
import { savePuzzleState, loadPuzzleState, clearPuzzleState } from '@/hooks/useStorage';

import { DEFAULT_SIZE, RESTRICT_Z3_TO_LARGE_GRIDS, SolverType } from './constants';
import SolverHeader from './SolverHeader';
import PuzzleGrid from './PuzzleGrid';
import StatusIndicator from './StatusIndicator';
import SolverControls from './SolverControls';
import SolverFooter from './SolverFooter';

const initializeBoard = (boardSize: number) =>
    Array(boardSize).fill(null).map(() => Array(boardSize).fill(0));

/** Count occurrences of a color on the board */
const countColor = (board: number[][], color: number) =>
    board.flat().filter(c => c === color).length;

const FlowSolver = () => {
    const [size, setSize] = useState(DEFAULT_SIZE);
    const [board, setBoard] = useState<number[][]>(() => initializeBoard(DEFAULT_SIZE));
    const [solvedBoard, setSolvedBoard] = useState<number[][] | null>(null);

    // UX: Track current color being placed and whether we're placing first or second endpoint
    const [activeColor, setActiveColor] = useState(1);
    const [isPlacingSecond, setIsPlacingSecond] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSolving, setIsSolving] = useState(false);
    const [solverType, setSolverType] = useState<SolverType>('heuristic_bfs');
    const [solveTime, setSolveTime] = useState<number | null>(null);

    // Prevent hover preview flash during reset
    const [isResetting, setIsResetting] = useState(false);

    // IndexedDB: Track if initial load is complete
    const [isLoaded, setIsLoaded] = useState(false);
    const saveTimeoutRef = useRef<number | null>(null);
    const workerRef = useRef<Worker | null>(null);

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
        if (!isLoaded) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = window.setTimeout(() => {
            savePuzzleState({ size, board, solverType, activeColor, isPlacingSecond });
        }, 500);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [size, board, solverType, activeColor, isPlacingSecond, isLoaded]);

    // Cleanup worker on unmount
    useEffect(() => {
        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []);

    // ── Handlers ──────────────────────────────────────────────────────────────

    const resetBoard = useCallback((newSize: number = size) => {
        // Prevent hover preview flash by setting isResetting before state changes
        setIsResetting(true);
        setBoard(initializeBoard(newSize));
        setSolvedBoard(null);
        setActiveColor(1);
        setIsPlacingSecond(false);
        setError(null);
        setSolveTime(null);
        clearPuzzleState();
        // Re-enable hover preview after React has completed the render cycle
        requestAnimationFrame(() => setIsResetting(false));
    }, [size]);

    const handleSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newSize = parseInt(event.target.value);
        setSize(newSize);
        if (RESTRICT_Z3_TO_LARGE_GRIDS && newSize !== 15 && solverType === 'z3') {
            setSolverType('heuristic_bfs');
        }
        resetBoard(newSize);
    };

    const handleSolverTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = event.target.value as SolverType;
        if (RESTRICT_Z3_TO_LARGE_GRIDS && newType === 'z3' && size !== 15) {
            setError('Z3 is for 15x15 only');
            setTimeout(() => setError(null), 2000);
            setSolverType('heuristic_bfs');
            return;
        }
        setSolverType(newType);
    };

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

            const remaining = countColor(newBoard, cellValue);

            if (remaining === 1) {
                // One endpoint left - switch to complete this pair
                setActiveColor(cellValue);
                setIsPlacingSecond(true);
            } else if (remaining === 0) {
                // Both removed - find the lowest incomplete color
                let lowestIncomplete = 1;
                while (countColor(newBoard, lowestIncomplete) === 2) lowestIncomplete++;
                setActiveColor(lowestIncomplete);
                setIsPlacingSecond(countColor(newBoard, lowestIncomplete) === 1);
            }
        } else {
            // PLACE: Clicking empty cell places the active color
            // BUG FIX: Check if this color already has 2 endpoints
            const currentCount = countColor(board, activeColor);
            if (currentCount >= 2) {
                // Color is complete - find next available
                let nextColor = activeColor;
                while (countColor(board, nextColor) >= 2 && nextColor <= 16) nextColor++;
                if (nextColor > 16) return;
                setActiveColor(nextColor);
                setIsPlacingSecond(countColor(board, nextColor) === 1);
                return;
            }

            newBoard[x][y] = activeColor;

            if (currentCount === 1) {
                // This was the 2nd endpoint - advance to next color
                let nextColor = activeColor + 1;
                while (countColor(newBoard, nextColor) >= 2 && nextColor <= 16) nextColor++;
                setActiveColor(nextColor);
                setIsPlacingSecond(false);
            } else {
                // This was the 1st endpoint
                setIsPlacingSecond(true);
            }
        }

        setBoard(newBoard);
    }, [board, solvedBoard, activeColor]);

    const solveBoard = async () => {
        setError(null);

        // ── Validation ──────────────────────────────────────────────────────────
        const placedColors = Array.from(new Set(board.flat())).filter(c => c !== 0);

        if (placedColors.length === 0) {
            setError('Please place some endpoints');
            setTimeout(() => setError(null), 3000);
            return;
        }

        for (const color of placedColors) {
            const count = countColor(board, color);
            if (count === 1) {
                setError(`Color ${color} is missing an endpoint`);
                setTimeout(() => setError(null), 3000);
                return;
            }
        }

        // ── Start Solver ────────────────────────────────────────────────────────
        setIsSolving(true);

        if (workerRef.current) workerRef.current.terminate();

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
                setSolveTime(performance.now() - startTime);
                setSolvedBoard(result.board);
            } else if (result.timedOut) {
                setError(solverType === 'astar' ? 'Timed out. Try Heuristic BFS.' : 'Timed out (15s limit)');
                setTimeout(() => setError(null), 4000);
            } else if (result.error) {
                setError('Solver error: ' + result.error);
                setTimeout(() => setError(null), 3000);
            } else {
                setError(solverType === 'heuristic_bfs' && size === 15 ? 'No solution. Try Z3.' : 'No solution found');
                setTimeout(() => setError(null), 3000);
            }
        };

        worker.onerror = (err) => {
            console.error('Worker error:', err);
            setIsSolving(false);
            setError('Solver error. Please try again.');
            setTimeout(() => setError(null), 3000);
            workerRef.current = null;
            worker.terminate();
        };
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const currentBoard = solvedBoard || board;

    return (
        <main className='relative flex flex-col justify-center items-center h-[100dvh] w-full bg-stoic-bg safe-area-inset touch-manipulation overflow-hidden gap-3'>
            <SolverHeader />

            <PuzzleGrid
                size={size}
                currentBoard={currentBoard}
                solvedBoard={solvedBoard}
                activeColor={activeColor}
                isResetting={isResetting}
                onCellClick={handleCellClick}
            />

            <section aria-label="Game Controls" className="flex flex-col items-center gap-3 shrink-0 z-10">
                <StatusIndicator
                    isSolving={isSolving}
                    error={error}
                    solvedBoard={solvedBoard}
                    solveTime={solveTime}
                    activeColor={activeColor}
                    isPlacingSecond={isPlacingSecond}
                />

                <SolverControls
                    size={size}
                    solverType={solverType}
                    isSolving={isSolving}
                    onSizeChange={handleSizeChange}
                    onSolverTypeChange={handleSolverTypeChange}
                    onSolve={solveBoard}
                    onReset={() => resetBoard()}
                />
            </section>

            <SolverFooter />
        </main>
    );
};

export default FlowSolver;
