import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { savePuzzleState, loadPuzzleState, type PuzzleDraft } from '@/hooks/useStorage';

import { DEFAULT_SIZE, RESTRICT_Z3_TO_LARGE_GRIDS, SolverType } from './constants';
import SolverHeader from './SolverHeader';
import PuzzleGrid from './PuzzleGrid';
import StatusIndicator from './StatusIndicator';
import SolverControls from './SolverControls';
import { GAME_MODES, type GameMode } from '../logic/game-modes';
import { normalizeTopology, seamKey, type Bridge, type WarpSeam, type PuzzleTopology } from '../logic/topology';
import { boardToSolution, solutionBoard, validateSolution, type PuzzleSolution } from '../logic/solution';
import type { GeneratedModePuzzle } from '../logic/variant-generator';
import { type Wall, type EditTool } from '../logic/walls';

type EditorSnapshot = { board: number[][]; walls: Wall[]; bridges: Bridge[]; warps: WarpSeam[]; activeColor: number; isPlacingSecond: boolean };

const initializeBoard = (width: number, height = width) =>
    Array(width).fill(null).map(() => Array(height).fill(0));

/** Count occurrences of a color on the board */
const countColor = (board: number[][], color: number) =>
    board.flat().filter(c => c === color).length;

const FlowSolver = () => {
    const [width, setWidth] = useState(DEFAULT_SIZE);
    const [height, setHeight] = useState(DEFAULT_SIZE);
    const [mode, setMode] = useState<GameMode>('standard');
    const [bridges, setBridges] = useState<Bridge[]>([]);
    const [warps, setWarps] = useState<WarpSeam[]>([]);
    const [pathSolution, setPathSolution] = useState<PuzzleSolution | null>(null);
    const draftsRef = useRef<Partial<Record<GameMode, PuzzleDraft>>>({});
    const historiesRef = useRef<Partial<Record<GameMode, EditorSnapshot[]>>>({});
    const [walls, setWalls] = useState<Wall[]>([]);
    const [editHistory, setEditHistory] = useState<EditorSnapshot[]>([]);
    const [editTool, setEditTool] = useState<EditTool>('dots');
    const isStandard = mode === 'standard';
    const isAvailable = GAME_MODES[mode].available;
    const wasmOnly = width !== height || !isStandard || walls.length > 0;
    const [board, setBoard] = useState<number[][]>(() => initializeBoard(DEFAULT_SIZE));
    const [solvedBoard, setSolvedBoard] = useState<number[][] | null>(null);
    const [generatedSolution, setGeneratedSolution] = useState<number[][] | null>(null);
    const [generatedPathSolution, setGeneratedPathSolution] = useState<PuzzleSolution | null>(null);
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

    const currentDraft = (): PuzzleDraft => ({ width, height, board, walls, bridges, warps, solverType, activeColor, isPlacingSecond, generatedSolution, generatedPathSolution });
    const restoreDraft = (draft: PuzzleDraft, draftMode: GameMode) => {
        setWidth(draft.width); setHeight(draft.height); setBoard(draft.board);
        setWalls(draft.walls); setBridges(draft.bridges.map(bridge => ({ ...bridge, over: 'horizontal' }))); setWarps(draft.warps);
        setActiveColor(draft.activeColor); setIsPlacingSecond(draft.isPlacingSecond);
        setGeneratedSolution(draft.generatedSolution);
        setGeneratedPathSolution(draft.generatedPathSolution ?? null);
        setSolverType(draftMode !== 'standard' || draft.width !== draft.height || draft.walls.length ? 'heuristic_bfs' : draft.solverType);
    };

    // Load saved state on mount
    useEffect(() => {
        loadPuzzleState().then((saved) => {
            if (saved) {
                try {
                    if (saved.schemaVersion !== undefined && saved.schemaVersion !== 2) throw new Error('Unknown saved puzzle version');
                    const savedMode = saved.mode ?? 'standard';
                    const legacy = saved.schemaVersion !== 2;
                    if (!GAME_MODES[savedMode] || (!legacy && !GAME_MODES[savedMode].available)) throw new Error('Invalid saved mode');
                    const currentMode = GAME_MODES[savedMode]?.available ? savedMode : 'standard';
                    const initial: PuzzleDraft = {
                        width: saved.width ?? saved.size ?? DEFAULT_SIZE,
                        height: saved.height ?? saved.size ?? DEFAULT_SIZE,
                        board: saved.board, walls: saved.walls ?? [], bridges: legacy ? [] : saved.bridges ?? [],
                        warps: legacy ? [] : saved.warps ?? [], solverType: saved.solverType,
                        activeColor: saved.activeColor, isPlacingSecond: saved.isPlacingSecond,
                        generatedSolution: saved.generatedSolution ?? null,
                        generatedPathSolution: saved.generatedPathSolution ?? null,
                    };
                    const drafts = legacy ? { standard: initial } : { ...saved.drafts, [currentMode]: initial };
                    for (const [key, draft] of Object.entries(drafts)) {
                        if (!draft || !GAME_MODES[key as GameMode]?.available) throw new Error('Invalid saved mode');
                        if (![draft.width, draft.height].every(n => Number.isInteger(n) && n >= 5 && n <= 15) ||
                            draft.board.length !== draft.width || draft.board[0]?.length !== draft.height) throw new Error('Invalid saved dimensions');
                        if (!['heuristic_bfs', 'astar', 'z3'].includes(draft.solverType) ||
                            !Number.isInteger(draft.activeColor) || draft.activeColor < 1 || draft.activeColor > 17 ||
                            typeof draft.isPlacingSecond !== 'boolean') throw new Error('Invalid saved editor state');
                        const topology = normalizeTopology(draft, draft.board, key as GameMode);
                        Object.assign(draft, topology);
                        if (topology.walls.length || (key !== 'standard' && !draft.generatedPathSolution)) {
                            draft.generatedSolution = null; draft.generatedPathSolution = null;
                        }
                        if (draft.generatedPathSolution) {
                            validateSolution(draft.board, topology, draft.generatedPathSolution);
                            if (JSON.stringify(solutionBoard(draft.board, draft.generatedPathSolution)) !== JSON.stringify(draft.generatedSolution)) throw new Error('Invalid generated solution');
                        } else if (draft.generatedSolution) boardToSolution(draft.board, draft.generatedSolution, topology);
                    }
                    draftsRef.current = drafts;
                    const draft = drafts[currentMode] ?? { ...initial, board: initializeBoard(initial.width, initial.height), walls: [], bridges: [], warps: [], generatedSolution: null, generatedPathSolution: null, activeColor: 1, isPlacingSecond: false };
                    restoreDraft(draft, currentMode);
                    setMode(currentMode);
                } catch (error) {
                    setError(`Saved puzzle is invalid. Reset the board to start again. ${error instanceof Error ? error.message : ''}`);
                    setInvalidSavedWalls(true);
                }
            }
            setIsLoaded(true);
        });
    }, []);

    // Auto-save state on changes (debounced 500ms)
    useEffect(() => {
        if (!isLoaded || invalidSavedWalls) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = window.setTimeout(() => {
            const draft = currentDraft();
            draftsRef.current[mode] = draft;
            savePuzzleState({ ...draft, mode, schemaVersion: 2, drafts: draftsRef.current });
        }, 500);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [width, height, mode, board, walls, bridges, warps, solverType, activeColor, isPlacingSecond, generatedSolution, generatedPathSolution, isLoaded, invalidSavedWalls]);

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
        setBridges([]); setWarps([]);
        setEditHistory([]);
        setInvalidSavedWalls(false);
        setSolvedBoard(null); setPathSolution(null);
        setGeneratedSolution(null); setGeneratedPathSolution(null);
        setActiveColor(1);
        setIsPlacingSecond(false);
        setError(null);
        setSolveTime(null);
        if (invalidSavedWalls) draftsRef.current = {};
        const draft: PuzzleDraft = { width: newWidth, height: newHeight, board: initializeBoard(newWidth, newHeight), walls: [], bridges: [], warps: [],
            activeColor: 1, isPlacingSecond: false, generatedSolution: null,
            solverType: mode !== 'standard' || newWidth !== newHeight ? 'heuristic_bfs' : solverType };
        draftsRef.current[mode] = draft; historiesRef.current[mode] = [];
        savePuzzleState({ ...draft, mode, schemaVersion: 2, drafts: draftsRef.current });
        // Re-enable hover preview after React has completed the render cycle
        requestAnimationFrame(() => setIsResetting(false));
    }, [width, height, mode, solverType, invalidSavedWalls]);

    const requestReset = () => {
        const hasPuzzle = walls.length > 0 || bridges.length > 0 || warps.length > 0 || board.some(column => column.some(color => color !== 0)) ||
            generatedSolution !== null || solvedBoard !== null || isSolving || isGenerating || invalidSavedWalls;
        if (hasPuzzle && !window.confirm('Reset this puzzle? This will clear all endpoints, walls, bridges, warps, and saved solutions.')) return;
        resetBoard();
    };

    const changeDimensions = (newWidth: number, newHeight: number) => {
        if (newWidth === width && newHeight === height) return;
        if ((board.flat().some(Boolean) || walls.length || bridges.length || warps.length) &&
            !window.confirm('Resize this puzzle? This will clear its endpoints, walls, bridges, warps, and saved solution.')) return;
        setWidth(newWidth);
        setHeight(newHeight);
        if (newWidth !== newHeight || (RESTRICT_Z3_TO_LARGE_GRIDS && newWidth !== 15)) {
            setSolverType('heuristic_bfs');
        }
        resetBoard(newWidth, newHeight);
    };

    const handleModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const next = event.target.value as GameMode;
        if (next === mode || !GAME_MODES[next]?.available || invalidSavedWalls) return;
        draftsRef.current[mode] = currentDraft();
        historiesRef.current[mode] = editHistory;
        workerRef.current?.terminate(); workerRef.current = null;
        setIsSolving(false); setIsGenerating(false); setSolvedBoard(null); setPathSolution(null);
        setError(null); setSolveTime(null); setEditTool('dots');
        const draft = draftsRef.current[next] ?? { width, height, board: initializeBoard(width, height),
            walls: [], bridges: [], warps: [], solverType: 'heuristic_bfs', activeColor: 1, isPlacingSecond: false, generatedSolution: null };
        restoreDraft(draft, next); setMode(next); setEditHistory(historiesRef.current[next] ?? []);
        if (next !== 'standard') setSolverType('heuristic_bfs');
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
        setEditHistory(history => [...history.slice(-49), { board, walls, bridges, warps, activeColor, isPlacingSecond }]);
    }, [board, walls, bridges, warps, activeColor, isPlacingSecond]);

    const handleCellClick = useCallback((x: number, y: number) => {
        if (invalidSavedWalls || editTool !== 'dots' || solvedBoard || isSolving || isGenerating || !isLoaded || !isAvailable) return;

        if (bridges.some(b => b.x === x && b.y === y)) { setError('Remove this bridge before placing a dot'); return; }
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
        setGeneratedSolution(null); setGeneratedPathSolution(null);
        setError(null);
        setSolveTime(null);
    }, [board, solvedBoard, isSolving, isGenerating, isLoaded, isAvailable, bridges, activeColor, editTool, invalidSavedWalls, recordEdit]);

    const applyTopology = (input: PuzzleTopology) => {
        if (invalidSavedWalls || solvedBoard || isSolving || isGenerating || !isLoaded || !isAvailable) return;
        let next: PuzzleTopology;
        try { next = normalizeTopology(input, board, mode); }
        catch (error) { setError(error instanceof Error ? error.message : 'Invalid topology'); return; }
        if (JSON.stringify(next) === JSON.stringify({ walls, bridges, warps })) return;
        recordEdit(); setWalls(next.walls); setBridges(next.bridges); setWarps(next.warps);
        setGeneratedSolution(null); setGeneratedPathSolution(null); setSolvedBoard(null); setPathSolution(null); setSolveTime(null); setError(null);
        if (mode !== 'standard' || next.walls.length) setSolverType('heuristic_bfs');
    };
    const applyWalls = (next: Wall[]) => applyTopology({ walls: next, bridges, warps });
    const toggleBridge = (x: number, y: number) => applyTopology({ walls, warps, bridges:
        bridges.some(b => b.x === x && b.y === y) ? bridges.filter(b => b.x !== x || b.y !== y) : [...bridges, { x, y, over: 'horizontal' }] });
    const toggleSeam = (seam: WarpSeam) => applyTopology({ walls, bridges, warps:
        warps.some(s => seamKey(s) === seamKey(seam)) ? warps.filter(s => seamKey(s) !== seamKey(seam)) : [...warps, seam] });

    const canUndo = editHistory.length > 0 && !invalidSavedWalls && !solvedBoard && !isSolving && !isGenerating && isLoaded && isAvailable;
    const undoEdit = () => {
        if (!canUndo) return;
        const previous = editHistory.at(-1)!;
        setBoard(previous.board);
        setWalls(previous.walls); setBridges(previous.bridges); setWarps(previous.warps);
        setActiveColor(previous.activeColor);
        setIsPlacingSecond(previous.isPlacingSecond);
        setGeneratedSolution(null); setGeneratedPathSolution(null);
        setError(null);
        setSolveTime(null);
        if (previous.walls.length) setSolverType('heuristic_bfs');
        setEditHistory(history => history.slice(0, -1));
    };

    const generateBoard = () => {
        if (invalidSavedWalls || walls.length || isSolving || isGenerating || !isLoaded || !isAvailable) return;
        if (!generatedSolution && (board.flat().some(Boolean) || bridges.length || warps.length) &&
            !window.confirm(isStandard ? 'Replace your endpoints with a generated puzzle?' : 'Replace your puzzle with a generated puzzle?')) return;
        setError(null);
        setIsGenerating(true);
        const worker = new Worker(
            new URL('../workers/generator.worker.ts', import.meta.url),
            { type: 'module' }
        );
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent<{ puzzle?: GeneratedModePuzzle; error?: string }>) => {
            if (workerRef.current !== worker) return;
            workerRef.current = null;
            worker.terminate();
            setIsGenerating(false);
            const { puzzle, error: generationError } = event.data;
            if (!puzzle) {
                setError(generationError || 'Could not generate puzzle. Please try again.');
                return;
            }
            try {
                if (puzzle.mode !== mode || puzzle.width !== width || puzzle.height !== height) throw new Error('Generator returned a different puzzle mode or size');
                normalizeTopology(puzzle.topology, puzzle.board, mode);
                validateSolution(puzzle.board, puzzle.topology, puzzle.pathSolution);
            } catch (error) {
                setError(error instanceof Error ? error.message : 'Invalid generated puzzle');
                return;
            }
            setBoard(puzzle.board);
            setBridges(puzzle.topology.bridges); setWarps(puzzle.topology.warps);
            setEditHistory([]);
            setGeneratedSolution(puzzle.solution);
            setGeneratedPathSolution(puzzle.pathSolution);
            setEditTool('dots');
            setSolvedBoard(null); setPathSolution(null);
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

    const cancelWork = () => {
        workerRef.current?.terminate(); workerRef.current = null;
        setIsSolving(false); setIsGenerating(false); setError(null);
    };

    const solveBoard = async () => {
        if (invalidSavedWalls || isSolving || isGenerating || !isLoaded || !isAvailable) return;
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
        worker.postMessage({ board, type: solverType, mode, walls, bridges, warps });

        worker.onmessage = (event) => {
            if (workerRef.current !== worker) return;
            const result = event.data;
            setIsSolving(false);
            workerRef.current = null;
            worker.terminate();

            if (result.board) {
                setSolveTime(performance.now() - startTime);
                setSolvedBoard(result.board); setPathSolution(result.solution ?? null);
            } else if (generatedSolution && (result.timedOut || /result code 2/.test(result.error ?? ''))) {
                // Generated puzzles already have a valid solution if search reaches its budget.
                setSolvedBoard(generatedSolution);
                setPathSolution(generatedPathSolution);
                setSolveTime(null);
            } else if (result.timedOut) {
                setError(mode !== 'standard' ? 'Search limit reached. Your puzzle is preserved.' : solverType === 'astar' ? 'Timed out. Try Heuristic BFS.' : 'Timed out (15s limit)');
            } else if (result.error) {
                setError('Solver error: ' + result.error);
            } else {
                setError(isStandard && !walls.length && solverType === 'heuristic_bfs' && width === 15 && height === 15 ? 'No solution. Try Z3.' : 'No solution found');
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
    const visibleSolution = useMemo(() => solvedBoard ? pathSolution ?? boardToSolution(board, solvedBoard, { walls, bridges, warps }) : null,
        [board, solvedBoard, pathSolution, walls, bridges, warps]);

    return (
        <main className="solver-shell touch-manipulation" onKeyDown={event => {
            const target = event.target as HTMLElement;
            if (canUndo && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z' &&
                !target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
                event.preventDefault();
                undoEdit();
            }
        }}>
            <SolverHeader editTool={editTool} />

            <div className="solver-workspace">
                <StatusIndicator
                    isSolving={isSolving}
                    isGenerating={isGenerating}
                    generatedPairCount={generatedSolution ? new Set(generatedSolution.flat()).size : null}
                    unavailableMode={isAvailable ? null : GAME_MODES[mode].label}
                    error={error}
                    solvedBoard={solvedBoard}
                    solveTime={solveTime}
                    activeColor={activeColor}
                    isPlacingSecond={isPlacingSecond}
                    editingWalls={editTool === 'walls'}
                    wallCount={walls.length}
                    editTool={editTool} bridgeCount={bridges.length} warpCount={warps.length}
                />
                <section className="board-area" aria-label="Puzzle editor">
                    <div className="board-viewport">
                        <PuzzleGrid
                            width={width}
                            height={height}
                            activeColor={activeColor}
                            currentBoard={currentBoard}
                            solvedBoard={solvedBoard}
                            isSolving={invalidSavedWalls || isSolving || isGenerating || !isLoaded || !isAvailable}
                            isResetting={isResetting}
                            onCellClick={handleCellClick}
                            walls={walls}
                            editTool={editTool}
                            onWallsChange={applyWalls}
                            endpointBoard={board} solution={visibleSolution} bridges={bridges} warps={warps}
                            onBridgeClick={toggleBridge} onSeamClick={toggleSeam}
                        />
                    </div>
                    <p className="sr-only" id="board-keyboard-help">Use arrow keys to move between cells. {editTool === 'warps' ? 'Press Shift and an outward arrow at a border to toggle a warp.' : editTool === 'bridges' ? 'Press Enter or Space to add or remove a bridge.' : editTool === 'walls' ? 'Press Shift and an arrow key to add or remove a wall on that side.' : 'Press Enter or Space to place or remove a dot.'}</p>
                    <p id="board-instructions" className="sr-only">{editTool === 'warps' ? 'Tap a border to open or close an opposite-edge warp.' : editTool === 'bridges' ? 'Tap an empty interior cell to add or remove a bridge.' : editTool === 'walls' ? 'Tap or drag along lines between cells to add or remove walls. Cell centers and outer borders do not change.' : 'Tap an empty cell to place a dot. Tap a dot to remove it.'}</p>
                </section>
                <section aria-label="Game Controls" className="game-controls">
                    <SolverControls
                        onEdit={() => { setSolvedBoard(null); setPathSolution(null); setSolveTime(null); setError(null); }}
                        width={width}
                        height={height}
                        solverType={solverType}
                        isSolving={isSolving}
                        isGenerating={isGenerating}
                        isLoaded={isLoaded}
                        invalidSavedWalls={invalidSavedWalls}
                        showingSolution={solvedBoard !== null}
                        mode={mode}
                        onModeChange={handleModeChange}
                        onSizeChange={(event) => changeDimensions(Number(event.target.value), Number(event.target.value))}
                        onWidthChange={(event) => changeDimensions(Number(event.target.value), height)}
                        onHeightChange={(event) => changeDimensions(width, Number(event.target.value))}
                        onSolverTypeChange={handleSolverTypeChange}
                        onSolve={solveBoard}
                        onCancel={cancelWork}
                        onReset={requestReset}
                        onGenerate={generateBoard}
                        wallCount={walls.length}
                        editTool={editTool}
                        onEditToolChange={setEditTool}
                        canUndo={canUndo}
                        onUndo={undoEdit}
                        onClearWalls={() => applyWalls([])}
                        bridges={bridges} warps={warps}
                        onClearBridges={() => applyTopology({ walls, warps, bridges: [] })}
                        onWarpsChange={next => applyTopology({ walls, bridges, warps: next })}
                    />
                </section>
            </div>
        </main>
    );
};

export default FlowSolver;
