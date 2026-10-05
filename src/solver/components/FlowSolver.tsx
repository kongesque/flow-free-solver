import { Maximize2, Minimize2 } from 'lucide-react';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { savePuzzleState, loadPuzzleState, clearPuzzleState } from '@/hooks/useStorage';

import { DEFAULT_SIZE, RESTRICT_Z3_TO_LARGE_GRIDS, SolverType } from './constants';
import SolverHeader from './SolverHeader';
import PuzzleGrid from './PuzzleGrid';
import StatusIndicator from './StatusIndicator';
import SolverControls from './SolverControls';
import SolverFooter from './SolverFooter';
import { GAME_MODES, type GameMode } from '../logic/game-modes';
import type { GeneratedPuzzle } from '../logic/puzzle-generator';

const initializeBoard = (width: number, height = width) =>
    Array(width).fill(null).map(() => Array(height).fill(0));

/** Count occurrences of a color on the board */
const countColor = (board: number[][], color: number) =>
    board.flat().filter(c => c === color).length;

interface EditorSnapshot {
    board: number[][];
    activeColor: number;
    isPlacingSecond: boolean;
    generatedSolution: number[][] | null;
}

const FlowSolver = () => {
    const [width, setWidth] = useState(DEFAULT_SIZE);
    const [height, setHeight] = useState(DEFAULT_SIZE);
    const [mode, setMode] = useState<GameMode>('standard');
    const isStandard = mode === 'standard';
    const wasmOnly = width !== height || !isStandard;
    const [board, setBoard] = useState<number[][]>(() => initializeBoard(DEFAULT_SIZE));
    const [solvedBoard, setSolvedBoard] = useState<number[][] | null>(null);
    const [generatedSolution, setGeneratedSolution] = useState<number[][] | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [history, setHistory] = useState<EditorSnapshot[]>([]);
    const [boardEnlarged, setBoardEnlarged] = useState(false);

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
                const savedWidth = saved.width ?? saved.size ?? DEFAULT_SIZE;
                const savedHeight = saved.height ?? saved.size ?? DEFAULT_SIZE;
                setWidth(savedWidth);
                setHeight(savedHeight);
                setMode(saved.mode ?? 'standard');
                setBoard(saved.board);
                setSolverType(savedWidth !== savedHeight || (saved.mode && saved.mode !== 'standard') ? 'heuristic_bfs' : saved.solverType);
                setActiveColor(saved.activeColor);
                setIsPlacingSecond(saved.isPlacingSecond);
                setGeneratedSolution(saved.generatedSolution ?? null);
            }
            setIsLoaded(true);
        });
    }, []);

    // Auto-save state on changes (debounced 500ms)
    useEffect(() => {
        if (!isLoaded) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = window.setTimeout(() => {
            savePuzzleState({ width, height, mode, board, solverType, activeColor, isPlacingSecond, generatedSolution });
        }, 500);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [width, height, mode, board, solverType, activeColor, isPlacingSecond, generatedSolution, isLoaded]);

    // Cleanup worker on unmount
    useEffect(() => {
        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []);

    // ── Handlers ──────────────────────────────────────────────────────────────

    const resetBoard = useCallback((newWidth = width, newHeight = height) => {
        workerRef.current?.terminate();
        workerRef.current = null;
        setIsSolving(false);
        setIsGenerating(false);
        // Prevent hover preview flash by setting isResetting before state changes
        setIsResetting(true);
        setBoard(initializeBoard(newWidth, newHeight));
        setHistory([]);
        setBoardEnlarged(false);
        setSolvedBoard(null);
        setGeneratedSolution(null);
        setActiveColor(1);
        setIsPlacingSecond(false);
        setError(null);
        setSolveTime(null);
        clearPuzzleState();
        // Re-enable hover preview after React has completed the render cycle
        requestAnimationFrame(() => setIsResetting(false));
    }, [width, height]);

    const changeDimensions = (newWidth: number, newHeight: number) => {
        setWidth(newWidth);
        setHeight(newHeight);
        if (newWidth !== newHeight || (RESTRICT_Z3_TO_LARGE_GRIDS && newWidth !== 15)) {
            setSolverType('heuristic_bfs');
        }
        resetBoard(newWidth, newHeight);
    };

    const handleModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newMode = event.target.value as GameMode;
        setMode(newMode);
        setError(null);
        if (newMode !== 'standard') setSolverType('heuristic_bfs');
    };

    const handleSolverTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = event.target.value as SolverType;
        if (wasmOnly && newType !== 'heuristic_bfs') return;
        if (RESTRICT_Z3_TO_LARGE_GRIDS && newType === 'z3' && (width !== 15 || height !== 15)) {
            setError('Z3 is for 15x15 only');
            setSolverType('heuristic_bfs');
            return;
        }
        setSolverType(newType);
        setError(null);
    };

    const selectColor = (color: number) => {
        if (solvedBoard || isSolving || isGenerating || !isLoaded || !isStandard || countColor(board, color) >= 2) return;
        setActiveColor(color);
        setIsPlacingSecond(countColor(board, color) === 1);
        setError(null);
    };

    const undoEdit = () => {
        if (solvedBoard || isSolving || isGenerating || !isLoaded || !isStandard) return;
        const previous = history.at(-1);
        if (!previous) return;
        setBoard(previous.board);
        setActiveColor(previous.activeColor);
        setIsPlacingSecond(previous.isPlacingSecond);
        setGeneratedSolution(previous.generatedSolution);
        setHistory(history.slice(0, -1));
        setError(null);
        setSolveTime(null);
    };

    // UX Best Practices:
    // 1. Simple mental model: Click empty = place, Click filled = remove
    // 2. Clear feedback: Show which color is being placed
    // 3. Predictable: Same action = same result
    // 4. Forgiving: Easy to undo mistakes
    const handleCellClick = useCallback((x: number, y: number) => {
        if (solvedBoard || isSolving || isGenerating || !isLoaded || !isStandard) return;

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
            // Use the selected incomplete color, then advance to the lowest incomplete pair.
            if (activeColor > 16 || countColor(board, activeColor) >= 2) return;
            newBoard[x][y] = activeColor;
            if (countColor(newBoard, activeColor) === 2) {
                let nextColor = 1;
                while (nextColor <= 16 && countColor(newBoard, nextColor) >= 2) nextColor++;
                setActiveColor(nextColor);
                setIsPlacingSecond(countColor(newBoard, nextColor) === 1);
            } else {
                setIsPlacingSecond(true);
            }
        }

        setHistory(previous => [...previous.slice(-99), { board, activeColor, isPlacingSecond, generatedSolution }]);

        setBoard(newBoard);
        setGeneratedSolution(null);
        setError(null);
        setSolveTime(null);
    }, [board, solvedBoard, isSolving, isGenerating, isLoaded, isStandard, activeColor, isPlacingSecond, generatedSolution]);

    const generateBoard = () => {
        if (isSolving || isGenerating || !isLoaded || !isStandard) return;
        setError(null);
        setIsGenerating(true);
        const worker = new Worker(
            new URL('../workers/generator.worker.ts', import.meta.url),
            { type: 'module' }
        );
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent<{ puzzle?: GeneratedPuzzle; error?: string }>) => {
            if (workerRef.current !== worker) return;
            workerRef.current = null;
            worker.terminate();
            setIsGenerating(false);
            const { puzzle, error: generationError } = event.data;
            if (!puzzle) {
                setError(generationError || 'Could not generate puzzle. Please try again.');
                return;
            }
            setHistory([]);
            setBoard(puzzle.board);
            setGeneratedSolution(puzzle.solution);
            setSolvedBoard(null);
            setSolveTime(null);
            setActiveColor(puzzle.pairCount + 1);
            setIsPlacingSecond(false);
        };
        worker.onerror = () => {
            if (workerRef.current !== worker) return;
            workerRef.current = null;
            worker.terminate();
            setIsGenerating(false);
            setError('Could not generate puzzle. Please try again.');
        };
        worker.postMessage({ width, height, mode, seed: crypto.getRandomValues(new Uint32Array(1))[0] });
    };

    const toggleGeneratedSolution = () => {
        if (!generatedSolution || isSolving || isGenerating || !isStandard) return;
        setSolvedBoard(solvedBoard ? null : generatedSolution);
        setSolveTime(null);
        setError(null);
    };

    const solveBoard = async () => {
        if (isSolving || isGenerating || !isLoaded || !isStandard) return;
        setError(null);

        // ── Validation ──────────────────────────────────────────────────────────
        const placedColors = Array.from(new Set(board.flat())).filter(c => c !== 0);

        if (placedColors.length === 0) {
            setError('Please place some endpoints');
            return;
        }

        for (const color of placedColors) {
            const count = countColor(board, color);
            if (count === 1) {
                setError(`Color ${color} is missing an endpoint`);
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
        worker.postMessage({ board, type: solverType, mode });

        worker.onmessage = (event) => {
            if (workerRef.current !== worker) return;
            const result = event.data;
            setIsSolving(false);
            workerRef.current = null;
            worker.terminate();

            if (result.board) {
                setSolveTime(performance.now() - startTime);
                setSolvedBoard(result.board);
            } else if (result.timedOut) {
                setError(generatedSolution ? 'Timed out. Use Show solution.' :
                    solverType === 'astar' ? 'Timed out. Try Heuristic BFS.' : 'Timed out (15s limit)');
            } else if (result.error) {
                setError(generatedSolution && /result code 2/.test(result.error) ?
                    'Search limit reached. Use Show solution.' : 'Solver error: ' + result.error);
            } else {
                setError(solverType === 'heuristic_bfs' && width === 15 && height === 15 ? 'No solution. Try Z3.' : 'No solution found');
            }
        };

        worker.onerror = (err) => {
            if (workerRef.current !== worker) return;
            console.error('Worker error:', err);
            setIsSolving(false);
            setError('Solver error. Please try again.');
            workerRef.current = null;
            worker.terminate();
        };
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const currentBoard = solvedBoard || board;

    return (
        <main className="solver-shell touch-manipulation">
            <SolverHeader />

            <div className="solver-workspace">
                <section className="board-area" aria-label="Puzzle editor">
                    <div className="board-heading selectable-text">
                        <span className="section-label">Your puzzle</span>
                        <div className="board-view-controls">
                            <span>{width} × {height}</span>
                            {Math.max(width, height) >= 9 && (
                                <button className="board-view-toggle" aria-pressed={boardEnlarged}
                                    aria-label={boardEnlarged ? 'Fit board' : 'Enlarge board'}
                                    onClick={() => setBoardEnlarged(!boardEnlarged)}>
                                    {boardEnlarged ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
                                    {boardEnlarged ? 'Fit' : 'Enlarge'}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="board-viewport" data-enlarged={boardEnlarged}>
                        <PuzzleGrid
                            enlarged={boardEnlarged}
                            width={width}
                            height={height}
                            currentBoard={currentBoard}
                            solvedBoard={solvedBoard}
                            isSolving={isSolving || isGenerating || !isLoaded || !isStandard}
                            activeColor={activeColor}
                            isResetting={isResetting}
                            onCellClick={handleCellClick}
                        />
                    </div>

                    <p className="sr-only" id="board-keyboard-help">Use arrow keys to move between cells. Press Enter or Space to place or remove a dot.</p>
                    <p id="board-instructions" className="board-instructions selectable-text">
                        {solvedBoard ? 'Every cell connected. Return to your endpoints to keep editing.' :
                            boardEnlarged ? 'Scroll to move around the board. Tap a cell to edit.' :
                            'Tap an empty cell to place a dot. Tap a dot to remove it.'}
                    </p>
                </section>
                <section aria-label="Game Controls" className="controls-panel">
                    <StatusIndicator
                        isSolving={isSolving}
                        isGenerating={isGenerating}
                        generatedPairCount={generatedSolution ? new Set(generatedSolution.flat()).size : null}
                        unavailableMode={isStandard ? null : GAME_MODES[mode].label}
                        error={error}
                        solvedBoard={solvedBoard}
                        solveTime={solveTime}
                        activeColor={activeColor}
                        isPlacingSecond={isPlacingSecond}
                    />

                    <SolverControls
                        board={board}
                        activeColor={activeColor}
                        canUndo={history.length > 0}
                        onColorSelect={selectColor}
                        onUndo={undoEdit}
                        onEdit={() => { setSolvedBoard(null); setSolveTime(null); setError(null); }}
                        width={width}
                        height={height}
                        solverType={solverType}
                        isSolving={isSolving}
                        isGenerating={isGenerating}
                        isLoaded={isLoaded}
                        hasGeneratedSolution={generatedSolution !== null}
                        showingSolution={solvedBoard !== null}
                        mode={mode}
                        onModeChange={handleModeChange}
                        onSizeChange={(event) => changeDimensions(Number(event.target.value), Number(event.target.value))}
                        onWidthChange={(event) => changeDimensions(Number(event.target.value), height)}
                        onHeightChange={(event) => changeDimensions(width, Number(event.target.value))}
                        onSolverTypeChange={handleSolverTypeChange}
                        onSolve={solveBoard}
                        onReset={() => resetBoard()}
                        onGenerate={generateBoard}
                        onToggleSolution={toggleGeneratedSolution}
                    />
                </section>
            </div>
            <SolverFooter />
        </main>
    );
};

export default FlowSolver;
