import React, { useState, useCallback, useEffect, useRef } from 'react';
import { savePuzzleState, loadPuzzleState, clearPuzzleState } from '@/hooks/useStorage';

import { COLOR_NAMES, DEFAULT_SIZE, RESTRICT_Z3_TO_LARGE_GRIDS, SolverType } from './constants';
import SolverHeader from './SolverHeader';
import PuzzleGrid from './PuzzleGrid';
import StatusIndicator from './StatusIndicator';
import SolverControls from './SolverControls';
import type { GameMode } from '../logic/game-modes';
import type { GeneratedPuzzle } from '../logic/puzzle-generator';
import { normalizeWalls, wallKey, type Wall, type EditTool } from '../logic/walls';

type EditorSnapshot = { board: number[][]; walls: Wall[]; activeColor: number; isPlacingSecond: boolean };

const initializeBoard = (width: number, height = width) =>
    Array(width).fill(null).map(() => Array(height).fill(0));

/** Count occurrences of a color on the board */
const countColor = (board: number[][], color: number) =>
    board.flat().filter(c => c === color).length;

const FlowSolver = () => {
    const [width, setWidth] = useState(DEFAULT_SIZE);
    const [height, setHeight] = useState(DEFAULT_SIZE);
    const [mode, setMode] = useState<GameMode>('standard');
    const [walls, setWalls] = useState<Wall[]>([]);
    const [editHistory, setEditHistory] = useState<EditorSnapshot[]>([]);
    const [editTool, setEditTool] = useState<EditTool>('dots');
    const [wallStart, setWallStart] = useState<[number, number] | null>(null);
    const [zoomBoard, setZoomBoard] = useState(false);
    const [canZoom, setCanZoom] = useState(false);
    const viewportRef = useRef<HTMLDivElement>(null);
    const isStandard = mode === 'standard';
    const wasmOnly = width !== height || !isStandard || walls.length > 0;
    const [board, setBoard] = useState<number[][]>(() => initializeBoard(DEFAULT_SIZE));
    const [solvedBoard, setSolvedBoard] = useState<number[][] | null>(null);
    const [generatedSolution, setGeneratedSolution] = useState<number[][] | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

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
    const [invalidSavedWalls, setInvalidSavedWalls] = useState(false);
    const saveTimeoutRef = useRef<number | null>(null);
    const workerRef = useRef<Worker | null>(null);

    // Load saved state on mount
    useEffect(() => {
        loadPuzzleState().then((saved) => {
            if (saved) {
                const savedWidth = saved.width ?? saved.size ?? DEFAULT_SIZE;
                const savedHeight = saved.height ?? saved.size ?? DEFAULT_SIZE;
                let savedWalls: Wall[];
                try {
                    savedWalls = normalizeWalls(saved.walls, savedWidth, savedHeight);
                } catch {
                    // Keep the fresh board rather than silently solving a save without its walls.
                    setError('Saved walls are invalid. Reset the board to start again.');
                    setInvalidSavedWalls(true);
                    setIsLoaded(true);
                    return;
                }
                setWidth(savedWidth);
                setHeight(savedHeight);
                // Older placeholder modes had no playable behavior. Keep their puzzle usable.
                setMode('standard');
                setBoard(saved.board);
                setWalls(savedWalls);
                setSolverType(savedWalls.length || savedWidth !== savedHeight || (saved.mode && saved.mode !== 'standard') ? 'heuristic_bfs' : saved.solverType);
                setActiveColor(saved.activeColor);
                setIsPlacingSecond(saved.isPlacingSecond);
                setGeneratedSolution(savedWalls.length ? null : saved.generatedSolution ?? null);
            }
            setIsLoaded(true);
        });
    }, []);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const measure = () => {
            const bounds = viewport.getBoundingClientRect();
            setCanZoom(Math.min(bounds.width, bounds.height) / Math.max(width, height) < 45);
        };
        const observer = new ResizeObserver(measure);
        observer.observe(viewport);
        measure();
        return () => observer.disconnect();
    }, [width, height]);

    // Auto-save state on changes (debounced 500ms)
    useEffect(() => {
        if (!isLoaded || invalidSavedWalls) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = window.setTimeout(() => {
            savePuzzleState({ width, height, mode, board, walls, solverType, activeColor, isPlacingSecond, generatedSolution });
        }, 500);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [width, height, mode, board, walls, solverType, activeColor, isPlacingSecond, generatedSolution, isLoaded, invalidSavedWalls]);

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
        setWalls([]);
        setWallStart(null);
        setEditHistory([]);
        setZoomBoard(false);
        setInvalidSavedWalls(false);
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

    const requestReset = () => {
        const hasPuzzle = walls.length > 0 || board.some(column => column.some(color => color !== 0)) ||
            generatedSolution !== null || solvedBoard !== null || isSolving || isGenerating || invalidSavedWalls;
        if (hasPuzzle && !window.confirm('Reset this puzzle? This will clear all endpoints, walls, and saved solutions.')) return;
        resetBoard();
    };

    const changeDimensions = (newWidth: number, newHeight: number) => {
        if (!Number.isInteger(newWidth) || !Number.isInteger(newHeight) || (newWidth === width && newHeight === height)) return;
        const hasWork = editHistory.length > 0 || walls.length > 0 || board.some(column => column.some(Boolean)) || generatedSolution !== null || solvedBoard !== null;
        if (hasWork && !window.confirm('Resize this puzzle? This will clear all endpoints, walls, and undo history.')) return;
        setWidth(newWidth);
        setHeight(newHeight);
        if (newWidth !== newHeight || (RESTRICT_Z3_TO_LARGE_GRIDS && newWidth !== 15)) {
            setSolverType('heuristic_bfs');
        }
        resetBoard(newWidth, newHeight);
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

    // UX Best Practices:
    // 1. Simple mental model: Click empty = place, Click filled = remove
    // 2. Clear feedback: Show which color is being placed
    // 3. Predictable: Same action = same result
    // 4. Forgiving: Easy to undo mistakes
    const recordEdit = useCallback(() => {
        setEditHistory(history => [...history.slice(-49), { board, walls, activeColor, isPlacingSecond }]);
    }, [board, walls, activeColor, isPlacingSecond]);

    const handleCellClick = useCallback((x: number, y: number) => {
        if (invalidSavedWalls || editTool !== 'dots' || solvedBoard || isSolving || isGenerating || !isLoaded || !isStandard) return;

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
            if (activeColor > 16) return;
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

        recordEdit();
        setBoard(newBoard);
        setGeneratedSolution(null);
        setError(null);
        setSolveTime(null);
    }, [board, solvedBoard, isSolving, isGenerating, isLoaded, isStandard, activeColor, editTool, invalidSavedWalls, recordEdit]);

    const applyWalls = (next: Wall[]) => {
        if (invalidSavedWalls || solvedBoard || isSolving || isGenerating || !isLoaded || !isStandard) return;
        const normalized = normalizeWalls(next, width, height);
        if (normalized.length === walls.length && normalized.every((wall, i) => wallKey(wall) === wallKey(walls[i]))) return;
        recordEdit();
        setWalls(normalized);
        setWallStart(null);
        setGeneratedSolution(null);
        setSolvedBoard(null);
        setSolveTime(null);
        setError(null);
        if (next.length) setSolverType('heuristic_bfs');
    };

    const canUndo = editHistory.length > 0 && !invalidSavedWalls && !solvedBoard && !isSolving && !isGenerating && isLoaded && isStandard;
    const undoEdit = () => {
        if (!canUndo) return;
        const previous = editHistory.at(-1)!;
        setBoard(previous.board);
        setWalls(previous.walls);
        setWallStart(null);
        setActiveColor(previous.activeColor);
        setIsPlacingSecond(previous.isPlacingSecond);
        setGeneratedSolution(null);
        setError(null);
        setSolveTime(null);
        if (previous.walls.length) setSolverType('heuristic_bfs');
        setEditHistory(history => history.slice(0, -1));
    };

    const generateBoard = () => {
        if (invalidSavedWalls || walls.length || isSolving || isGenerating || !isLoaded || !isStandard) return;
        if (!generatedSolution && board.some(column => column.some(color => color !== 0)) &&
            !window.confirm('Replace your endpoints with a generated puzzle?')) return;
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
            setWallStart(null);
            setBoard(puzzle.board);
            setEditHistory([]);
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
        worker.postMessage({ width, height, mode, walls, seed: crypto.getRandomValues(new Uint32Array(1))[0] });
    };

    const cancelOperation = () => {
        workerRef.current?.terminate();
        workerRef.current = null;
        setIsSolving(false);
        setIsGenerating(false);
        setError(null);
    };

    const solveBoard = async () => {
        if (invalidSavedWalls || isSolving || isGenerating || !isLoaded || !isStandard) return;
        setError(null);

        // ── Validation ──────────────────────────────────────────────────────────
        const placedColors = Array.from(new Set(board.flat())).filter(c => c !== 0);

        if (placedColors.length === 0) {
            setError('Place a pair to solve.');
            return;
        }

        for (const color of placedColors) {
            const count = countColor(board, color);
            if (count === 1) {
                setError(`${COLOR_NAMES[color]} needs a matching dot.`);
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
        worker.postMessage({ board, type: solverType, mode, walls });

        worker.onmessage = (event) => {
            if (workerRef.current !== worker) return;
            const result = event.data;
            setIsSolving(false);
            workerRef.current = null;
            worker.terminate();

            if (result.board) {
                setWallStart(null);
                setSolveTime(performance.now() - startTime);
                setSolvedBoard(result.board);
            } else if (!walls.length && generatedSolution && (result.timedOut || /result code 2/.test(result.error ?? ''))) {
                // Generated puzzles already have a valid solution if search reaches its budget.
                setWallStart(null);
                setSolvedBoard(generatedSolution);
                setSolveTime(null);
            } else if (result.timedOut) {
                setError(solverType === 'astar' ? 'Timed out. Try Heuristic BFS.' : 'Timed out (15s limit)');
            } else if (result.error) {
                setError('Solver error: ' + result.error);
            } else {
                setError(!walls.length && solverType === 'heuristic_bfs' && width === 15 && height === 15 ? 'No solution. Try Z3.' : 'No solution found');
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
        <main className="solver-shell touch-manipulation" onKeyDown={event => {
            const target = event.target as HTMLElement;
            if (canUndo && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z' &&
                !target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
                event.preventDefault();
                undoEdit();
            }
        }}>
            <SolverHeader />

            <div className="solver-workspace">
                <StatusIndicator
                    isSolving={isSolving}
                    isGenerating={isGenerating}
                    generatedPairCount={generatedSolution ? new Set(generatedSolution.flat()).size : null}
                    error={error}
                    solvedBoard={solvedBoard}
                    activeColor={activeColor}
                    isPlacingSecond={isPlacingSecond}
                    editingWalls={editTool === 'walls'}
                    choosingNeighbor={wallStart !== null}
                    hasDots={board.some(column => column.some(Boolean))}
                    onPlaceDots={() => { setEditTool('dots'); setWallStart(null); }}
                />
                <section className={`board-area ${zoomBoard && !solvedBoard ? 'board-zoom' : ''}`} aria-label="Puzzle editor">
                    <div className="board-viewport" ref={viewportRef}>
                        <PuzzleGrid
                            width={width}
                            height={height}
                            activeColor={activeColor}
                            currentBoard={currentBoard}
                            endpoints={board}
                            solvedBoard={solvedBoard}
                            isSolving={invalidSavedWalls || isSolving || isGenerating || !isLoaded || !isStandard}
                            isResetting={isResetting}
                            onCellClick={handleCellClick}
                            walls={walls}
                            editTool={editTool}
                            zoomed={zoomBoard && !solvedBoard}
                            onWallsChange={applyWalls}
                            wallStart={wallStart}
                            onWallStartChange={setWallStart}
                        />
                    </div>
                    <p className="sr-only" id="board-keyboard-help">Use arrow keys to move between cells. {editTool === 'walls' ? 'Press Enter or Space to pick a cell, then a neighboring cell. Shift and an arrow key toggles a wall directly. Escape cancels the selection.' : 'Press Enter or Space to place or remove a dot.'}</p>
                    <p id="board-instructions" className="sr-only">{editTool === 'walls' ? 'Pick two neighboring cells to add or remove the wall between them.' : 'Tap an empty cell to place a dot. Tap a dot to remove it.'}</p>
                </section>
                <section aria-label="Game Controls" className="game-controls">
                    <SolverControls
                        onEdit={() => { setSolvedBoard(null); setSolveTime(null); setError(null); }}
                        width={width}
                        height={height}
                        solverType={solverType}
                        isSolving={isSolving}
                        isGenerating={isGenerating}
                        isLoaded={isLoaded}
                        invalidSavedWalls={invalidSavedWalls}
                        showingSolution={solvedBoard !== null}
                        mode={mode}
                        onSizeChange={(event) => changeDimensions(Number(event.target.value), Number(event.target.value))}
                        onWidthChange={(event) => changeDimensions(Number(event.target.value), height)}
                        onHeightChange={(event) => changeDimensions(width, Number(event.target.value))}
                        onSolverTypeChange={handleSolverTypeChange}
                        onSolve={solveBoard}
                        onReset={requestReset}
                        onGenerate={generateBoard}
                        onCancel={cancelOperation}
                        solveTime={solveTime}
                        wallCount={walls.length}
                        editTool={editTool}
                        onEditToolChange={tool => { setEditTool(tool); setWallStart(null); }}
                        canUndo={canUndo}
                        onUndo={undoEdit}
                        onClearWalls={() => applyWalls([])}
                        canZoom={canZoom}
                        zoomed={zoomBoard}
                        onZoom={() => setZoomBoard(value => !value)}
                    />
                </section>
            </div>
        </main>
    );
};

export default FlowSolver;
