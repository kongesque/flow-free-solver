import type { Block } from '../logic/blocks';
import { MAX_BOARD_SIZE } from '../logic/board-limits';
import { isDotLabels, type DotLabels } from './constants';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { savePuzzleState, loadPuzzleState, type PuzzleDraft } from '@/hooks/useStorage';

import { DEFAULT_SIZE, SolverType } from './constants';
import { compatibleSolver } from '../logic/solver-options';
import SolverHeader from './SolverHeader';
import PuzzleGrid from './PuzzleGrid';
import StatusIndicator from './StatusIndicator';
import SolverControls from './SolverControls';
import { GAME_MODES, type GameMode } from '../logic/game-modes';
import { normalizeTopology, validateBoard, seamKey, type Bridge, type WarpSeam, type PuzzleTopology } from '../logic/topology';
import { boardToSolution, preferInducedGeneratedSolution, solutionBoard, validateInducedSolution, validateSolution, type PuzzleSolution } from '../logic/solution';
import type { GeneratedModePuzzle } from '../logic/variant-generator';
import { type Wall, type EditTool } from '../logic/walls';
import { nextPlacementColor } from '../logic/color-order';
import generatorWorkerUrl from '../workers/generator.worker.ts?worker&url';
import solverWorkerUrl from '../workers/solver.worker.ts?worker&url';

const createRunWorker = (source: string) => {
    const url = new URL(source, window.location.href);
    // Avoid older cached responses whose 304 metadata loses COEP on Safari.
    url.searchParams.set('run', crypto.randomUUID());
    return new Worker(url, { type: 'module' });
};

type EditorSnapshot = { blocks: Block[]; board: number[][]; walls: Wall[]; bridges: Bridge[]; warps: WarpSeam[]; activeColor: number; isPlacingSecond: boolean };

const initializeBoard = (width: number, height = width) =>
    Array(width).fill(null).map(() => Array(height).fill(0));

/** Count occurrences of a color on the board */
const countColor = (board: number[][], color: number) =>
    board.flat().filter(c => c === color).length;

const FlowSolver = () => {
    const [width, setWidth] = useState(DEFAULT_SIZE);
    const [height, setHeight] = useState(DEFAULT_SIZE);
    const [mode, setMode] = useState<GameMode>('standard');
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [bridges, setBridges] = useState<Bridge[]>([]);
    const [warps, setWarps] = useState<WarpSeam[]>([]);
    const [pathSolution, setPathSolution] = useState<PuzzleSolution | null>(null);
    const draftsRef = useRef<Partial<Record<GameMode, PuzzleDraft>>>({});
    const historiesRef = useRef<Partial<Record<GameMode, EditorSnapshot[]>>>({});
    const [walls, setWalls] = useState<Wall[]>([]);
    const [editHistory, setEditHistory] = useState<EditorSnapshot[]>([]);
    const [dotLabels, setDotLabels] = useState<DotLabels>(() => {
        try { const saved = localStorage.getItem('flow-dot-labels'); return isDotLabels(saved) ? saved : 'none'; } catch { return 'none'; }
    });
    const [showBoardGuides, setShowBoardGuides] = useState(() => {
        try { return localStorage.getItem('flow-coordinates') === 'true'; } catch { return false; }
    });
    const changeBoardGuides = (value: boolean) => {
        setShowBoardGuides(value);
        try { localStorage.setItem('flow-coordinates', String(value)); } catch { /* Retain the session preference. */ }
    };
    const changeDotLabels = (value: DotLabels) => {
        setDotLabels(value);
        setError(null);
        try { localStorage.setItem('flow-dot-labels', value); } catch { /* Keep the preference for this session when storage is unavailable. */ }
    };
    const [showGenerator, setShowGenerator] = useState(() => {
        try { return localStorage.getItem('flow-show-generator') !== 'false'; } catch { return true; }
    });
    const changeShowGenerator = (value: boolean) => {
        setShowGenerator(value);
        setError(null);
        try { localStorage.setItem('flow-show-generator', String(value)); } catch { /* Retain the session preference. */ }
    };
    const [editTool, setEditTool] = useState<EditTool>('dots');
    const isStandard = mode === 'standard';
    const isAvailable = GAME_MODES[mode].available;
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
    const [fallbackUsed, setFallbackUsed] = useState(false);

    // Prevent hover preview flash during reset
    const [isResetting, setIsResetting] = useState(false);

    // IndexedDB: Track if initial load is complete
    const [isLoaded, setIsLoaded] = useState(false);
    const [invalidSavedWalls, setInvalidSavedWalls] = useState(false);
    const saveTimeoutRef = useRef<number | null>(null);
    const workerRef = useRef<Worker | null>(null);

    const currentDraft = (): PuzzleDraft => ({ width, height, board, walls, bridges, warps, blocks, solverType, activeColor, isPlacingSecond, generatedSolution, generatedPathSolution });
    const restoreDraft = (draft: PuzzleDraft, draftMode: GameMode) => {
        setWidth(draft.width); setHeight(draft.height); setBoard(draft.board);
        setBlocks(draft.blocks ?? []); setWalls(draft.walls); setBridges(draft.bridges.map(bridge => ({ ...bridge, over: 'horizontal' }))); setWarps(draft.warps);
        const placementColor = countColor(draft.board, draft.activeColor) === 1 ? draft.activeColor : nextPlacementColor(draft.board);
        setActiveColor(placementColor); setIsPlacingSecond(countColor(draft.board, placementColor) === 1);
        setGeneratedSolution(draft.generatedSolution);
        setGeneratedPathSolution(draft.generatedPathSolution ?? null);
        setSolverType(compatibleSolver(draft.solverType, draftMode, draft.width, draft.height, draft.walls.length));
    };

    // Ignore loads from an earlier mount, including the development StrictMode probe.
    useEffect(() => {
        let active = true;
        loadPuzzleState().then((saved) => {
            if (!active) return;
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
                        board: saved.board, blocks: saved.blocks ?? [], walls: saved.walls ?? [], bridges: legacy ? [] : saved.bridges ?? [],
                        warps: legacy ? [] : saved.warps ?? [], solverType: saved.solverType,
                        activeColor: saved.activeColor, isPlacingSecond: saved.isPlacingSecond,
                        generatedSolution: saved.generatedSolution ?? null,
                        generatedPathSolution: saved.generatedPathSolution ?? null,
                    };
                    const drafts = legacy ? { standard: initial } : { ...saved.drafts, [currentMode]: initial };
                    for (const [key, draft] of Object.entries(drafts)) {
                        if (!draft || !GAME_MODES[key as GameMode]?.available) throw new Error('Invalid saved mode');
                        if (![draft.width, draft.height].every(n => Number.isInteger(n) && n >= 5 && n <= MAX_BOARD_SIZE) ||
                            draft.board.length !== draft.width || draft.board[0]?.length !== draft.height) throw new Error('Invalid saved dimensions');
                        if (!['heuristic_bfs', 'astar', 'z3'].includes(draft.solverType) ||
                            !Number.isInteger(draft.activeColor) || draft.activeColor < 1 || draft.activeColor > 17 ||
                            typeof draft.isPlacingSecond !== 'boolean') throw new Error('Invalid saved editor state');
                        const topology = normalizeTopology(draft, draft.board, key as GameMode);
                        Object.assign(draft, topology);
                        if (topology.walls.length || topology.blocks?.length || (key !== 'standard' && !draft.generatedPathSolution)) {
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
        return () => { active = false; };
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
    }, [width, height, mode, board, walls, bridges, warps, blocks, solverType, activeColor, isPlacingSecond, generatedSolution, generatedPathSolution, isLoaded, invalidSavedWalls]);

    // Cleanup worker on unmount
    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;
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
        setWalls([]); setBlocks([]);
        setBridges([]); setWarps([]);
        setEditHistory([]);
        setInvalidSavedWalls(false);
        setSolvedBoard(null); setPathSolution(null);
        setGeneratedSolution(null); setGeneratedPathSolution(null);
        setActiveColor(1);
        setIsPlacingSecond(false);
        setError(null);
        setSolveTime(null); setFallbackUsed(false);
        const nextSolver = compatibleSolver(solverType, mode, newWidth, newHeight, 0);
        setSolverType(nextSolver);
        if (invalidSavedWalls) draftsRef.current = {};
        const draft: PuzzleDraft = { width: newWidth, height: newHeight, board: initializeBoard(newWidth, newHeight), walls: [], bridges: [], warps: [],
            activeColor: 1, isPlacingSecond: false, generatedSolution: null,
            solverType: nextSolver };
        draftsRef.current[mode] = draft; historiesRef.current[mode] = [];
        savePuzzleState({ ...draft, mode, schemaVersion: 2, drafts: draftsRef.current });
        // Re-enable hover preview after React has completed the render cycle
        requestAnimationFrame(() => setIsResetting(false));
    }, [width, height, mode, solverType, invalidSavedWalls]);

    const requestReset = () => {
        const hasPuzzle = blocks.length > 0 || walls.length > 0 || bridges.length > 0 || warps.length > 0 || board.some(column => column.some(color => color !== 0)) ||
            generatedSolution !== null || solvedBoard !== null || isSolving || isGenerating || invalidSavedWalls;
        if (hasPuzzle && !window.confirm('Reset this puzzle? This will clear all endpoints, walls, blocks, bridges, warps, and saved solutions.')) return;
        resetBoard();
    };

    const changeDimensions = (newWidth: number, newHeight: number) => {
        if (newWidth === width && newHeight === height) return;
        if ((board.flat().some(Boolean) || walls.length || blocks.length || bridges.length || warps.length) &&
            !window.confirm('Resize this puzzle? This will clear its endpoints, walls, blocks, bridges, warps, and saved solution.')) return;
        setWidth(newWidth);
        setHeight(newHeight);
        resetBoard(newWidth, newHeight);
    };

    const handleModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const next = event.target.value as GameMode;
        if (next === mode || !GAME_MODES[next]?.available || invalidSavedWalls) return;
        draftsRef.current[mode] = currentDraft();
        historiesRef.current[mode] = editHistory;
        workerRef.current?.terminate(); workerRef.current = null;
        setIsSolving(false); setIsGenerating(false); setSolvedBoard(null); setPathSolution(null);
        setError(null); setSolveTime(null); setFallbackUsed(false); setEditTool('dots');
        const draft = draftsRef.current[next] ?? { width, height, board: initializeBoard(width, height),
            walls: [], bridges: [], warps: [], solverType: compatibleSolver(solverType, next, width, height, 0), activeColor: 1, isPlacingSecond: false, generatedSolution: null };
        restoreDraft(draft, next); setMode(next); setEditHistory(historiesRef.current[next] ?? []);
    };

    const handleSolverTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = event.target.value as SolverType;
        if (!['astar', 'z3', 'heuristic_bfs'].includes(newType) || compatibleSolver(newType, mode, width, height, walls.length) !== newType) return;
        setSolverType(newType);
        setError(null);
    };

    // UX Best Practices:
    // 1. Simple mental model: Click empty = place, Click filled = remove
    // 2. Clear feedback: Show which color is being placed
    // 3. Predictable: Same action = same result
    // 4. Forgiving: Easy to undo mistakes
    const recordEdit = useCallback(() => {
        setEditHistory(history => [...history.slice(-49), { board, walls, bridges, warps, blocks, activeColor, isPlacingSecond }]);
    }, [board, walls, bridges, warps, blocks, activeColor, isPlacingSecond]);

    const handleCellClick = useCallback((x: number, y: number) => {
        if (invalidSavedWalls || editTool !== 'dots' || solvedBoard || isSolving || isGenerating || !isLoaded || !isAvailable) return;

        if (blocks.some(b => b.x === x && b.y === y)) { setError('Remove this block before placing a dot'); return; }
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
                // Both removed - return to the first unfinished letter.
                const lowestIncomplete = nextPlacementColor(newBoard);
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
                const nextColor = nextPlacementColor(board);
                if (nextColor > 16) return;
                setActiveColor(nextColor);
                setIsPlacingSecond(countColor(board, nextColor) === 1);
                return;
            }

            newBoard[x][y] = activeColor;

            if (currentCount === 1) {
                // This was the 2nd endpoint - advance to next color
                const nextColor = nextPlacementColor(newBoard);
                setActiveColor(nextColor);
                setIsPlacingSecond(countColor(newBoard, nextColor) === 1);
            } else {
                // This was the 1st endpoint
                setIsPlacingSecond(true);
            }
        }

        recordEdit();
        setBoard(newBoard);
        setGeneratedSolution(null); setGeneratedPathSolution(null);
        setError(null);
        setSolveTime(null); setFallbackUsed(false);
    }, [board, solvedBoard, isSolving, isGenerating, isLoaded, isAvailable, bridges, blocks, activeColor, editTool, invalidSavedWalls, recordEdit]);

    const applyTopology = (input: PuzzleTopology) => {
        if (invalidSavedWalls || solvedBoard || isSolving || isGenerating || !isLoaded || !isAvailable) return;
        let next: PuzzleTopology;
        try { next = normalizeTopology(input, board, mode); }
        catch (error) { setError(error instanceof Error ? error.message : 'Invalid topology'); return; }
        if (JSON.stringify(next) === JSON.stringify(normalizeTopology({ walls, bridges, warps, blocks }, board, mode))) return;
        recordEdit(); setBlocks(next.blocks ?? []); setWalls(next.walls); setBridges(next.bridges); setWarps(next.warps);
        setGeneratedSolution(null); setGeneratedPathSolution(null); setSolvedBoard(null); setPathSolution(null); setSolveTime(null); setFallbackUsed(false); setError(null);
        setSolverType(compatibleSolver(solverType, mode, width, height, next.walls.length));
    };
    const applyWalls = (next: Wall[]) => applyTopology({ walls: next, bridges, warps, blocks });
    const toggleBridge = (x: number, y: number) => applyTopology({ walls, warps, blocks, bridges:
        bridges.some(b => b.x === x && b.y === y) ? bridges.filter(b => b.x !== x || b.y !== y) : [...bridges, { x, y, over: 'horizontal' }] });
    const toggleSeam = (seam: WarpSeam) => applyTopology({ walls, bridges, blocks, warps:
        warps.some(s => seamKey(s) === seamKey(seam)) ? warps.filter(s => seamKey(s) !== seamKey(seam)) : [...warps, seam] });

    const toggleBlock = (x: number, y: number) => {
        const removing = blocks.some(b => b.x === x && b.y === y);
        if (!removing && bridges.some(b => b.x === x && b.y === y)) {
            setError('Remove this bridge before adding a block'); return;
        }
        const nextBlocks = removing ? blocks.filter(b => b.x !== x || b.y !== y) : [...blocks, { x, y }];
        // A blocked border cannot remain an opening to the opposite edge.
        const nextWarps = removing ? warps : warps.filter(seam => seam.axis === 'horizontal'
            ? !((x === 0 || x === width - 1) && seam.index === y)
            : !((y === 0 || y === height - 1) && seam.index === x));
        applyTopology({ walls, bridges, warps: nextWarps, blocks: nextBlocks });
    };

    const canUndo = editHistory.length > 0 && !invalidSavedWalls && !solvedBoard && !isSolving && !isGenerating && isLoaded && isAvailable;
    const undoEdit = () => {
        if (!canUndo) return;
        const previous = editHistory.at(-1)!;
        setBoard(previous.board);
        setBlocks(previous.blocks); setWalls(previous.walls); setBridges(previous.bridges); setWarps(previous.warps);
        setActiveColor(previous.activeColor);
        setIsPlacingSecond(previous.isPlacingSecond);
        setGeneratedSolution(null); setGeneratedPathSolution(null);
        setError(null);
        setSolveTime(null); setFallbackUsed(false);
        setSolverType(compatibleSolver(solverType, mode, width, height, previous.walls.length));
        setEditHistory(history => history.slice(0, -1));
    };

    // Every exit releases the worker and busy state. Late events from a cancelled
    // mode are ignored, and invalid responses never reach React's render path.
    const runWorker = <T,>(createWorker: () => Worker, request: unknown, operation: 'solve' | 'generate', onResult: (result: T) => void) => {
        workerRef.current?.terminate();
        workerRef.current = null;
        let worker: Worker | null = null;
        const finish = () => {
            if (worker && workerRef.current !== worker) return false;
            workerRef.current = null;
            if (worker) {
                worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
                worker.terminate();
            }
            setIsSolving(false); setIsGenerating(false);
            return true;
        };
        const fail = () => {
            if (finish()) setError(operation === 'solve' ? 'Could not run the solver. Try Solve again.' : 'Could not generate puzzle. Try Generate again.');
        };
        setIsSolving(operation === 'solve'); setIsGenerating(operation === 'generate');
        try {
            worker = createWorker();
            workerRef.current = worker;
            worker.onmessage = event => {
                if (workerRef.current !== worker) return;
                if (operation === 'solve' && event.data?.kind === 'progress') {
                    if (event.data.phase === 'sat-fallback') setFallbackUsed(true);
                    return;
                }
                if (!finish()) return;
                try { onResult(event.data); }
                catch { setError(operation === 'solve' ? 'Solver returned an invalid solution. Try Solve again.' : 'Invalid generated puzzle. Try Generate again.'); }
            };
            worker.onerror = event => { event.preventDefault(); fail(); };
            worker.onmessageerror = fail;
            worker.postMessage(request);
        } catch { fail(); }
    };

    const generateBoard = () => {
        if (invalidSavedWalls || walls.length || blocks.length || isSolving || isGenerating || !isLoaded || !isAvailable) return;
        if (!generatedSolution && (board.flat().some(Boolean) || bridges.length || warps.length) &&
            !window.confirm(isStandard ? 'Replace your endpoints with a generated puzzle?' : 'Replace your puzzle with a generated puzzle?')) return;
        setError(null); setFallbackUsed(false);
        runWorker(() => createRunWorker(generatorWorkerUrl),
            { width, height, mode, walls, blocks, seed: crypto.getRandomValues(new Uint32Array(1))[0] }, 'generate',
            ({ puzzle, error: generationError }: { puzzle?: GeneratedModePuzzle; error?: string }) => {
                if (!puzzle) { setError(generationError || 'Could not generate puzzle. Try Generate again.'); return; }
                if (puzzle.mode !== mode || puzzle.width !== width || puzzle.height !== height) throw new Error('Generator returned a different puzzle mode or size');
                const topology = normalizeTopology(puzzle.topology, puzzle.board, mode);
                validateInducedSolution(puzzle.board, topology, puzzle.pathSolution);
                validateBoard(puzzle.solution);
                if (JSON.stringify(solutionBoard(puzzle.board, puzzle.pathSolution)) !== JSON.stringify(puzzle.solution) ||
                    puzzle.pairCount !== puzzle.pathSolution.paths.length) throw new Error('Invalid generated solution');
                setBlocks(topology.blocks ?? []); setBoard(puzzle.board); setWalls(topology.walls);
                setBridges(topology.bridges); setWarps(topology.warps);
                setEditHistory([]);
                setGeneratedSolution(puzzle.solution); setGeneratedPathSolution(puzzle.pathSolution);
                setEditTool('dots'); setSolvedBoard(null); setPathSolution(null); setSolveTime(null); setFallbackUsed(false);
                setActiveColor(nextPlacementColor(puzzle.board)); setIsPlacingSecond(false);
            });
    };

    const cancelWork = () => {
        workerRef.current?.terminate(); workerRef.current = null;
        setIsSolving(false); setIsGenerating(false); setError(null); setFallbackUsed(false);
    };

    const solveBoard = async () => {
        if (invalidSavedWalls || isSolving || isGenerating || !isLoaded || !isAvailable) return;
        setError(null); setFallbackUsed(false);

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

        const startTime = performance.now();
        const acceptSolution = (resultBoard: number[][], paths?: PuzzleSolution | null) => {
            validateBoard(resultBoard);
            const topology = { walls, bridges, warps, blocks };
            const solution = paths ?? boardToSolution(board, resultBoard, topology);
            validateSolution(board, topology, solution);
            if (JSON.stringify(solutionBoard(board, solution)) !== JSON.stringify(resultBoard)) throw new Error('Invalid solution matrix');
            const display = preferInducedGeneratedSolution(board, topology, solution, generatedPathSolution);
            setSolvedBoard(solutionBoard(board, display)); setPathSolution(display); setSolveTime(performance.now() - startTime);
        };
        runWorker(() => createRunWorker(solverWorkerUrl),
            { board, type: solverType, mode, walls, bridges, warps, blocks, allowFallback: generatedSolution === null,
                satCandidate: solverType === 'z3' ? generatedPathSolution : null }, 'solve',
            (result: { board: number[][] | null; solution?: PuzzleSolution | null; timedOut?: boolean; error?: string; fallbackUsed?: boolean }) => {
                if (!result || typeof result !== 'object' || !('board' in result)) throw new Error('Invalid solver response');
                setFallbackUsed(result.fallbackUsed === true);
                if (result.board) acceptSolution(result.board, result.solution);
                else if (generatedSolution && (result.timedOut || /result code 2/.test(result.error ?? ''))) {
                    acceptSolution(generatedSolution, generatedPathSolution);
                    setFallbackUsed(false);
                } else if (result.timedOut) {
                    setError(solverType === 'astar' ? 'Search limit reached. Try Heuristic BFS.' : 'Search limit reached. Your puzzle is preserved.');
                } else if (result.error) setError('Solver error: ' + result.error);
                else setError('No solution found');
            });
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const currentBoard = solvedBoard || board;
    const visibleSolution = solvedBoard ? pathSolution : null;

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
                    fallbackUsed={fallbackUsed}
                    activeColor={activeColor}
                    isPlacingSecond={isPlacingSecond}
                    editingWalls={editTool === 'walls'}
                    wallCount={walls.length}
                    editTool={editTool} blockCount={blocks.length} bridgeCount={bridges.length} warpCount={warps.length}
                />
                <section className="board-area" aria-label="Puzzle editor">
                    <div className="board-viewport">
                        <PuzzleGrid
                            width={width}
                            height={height}
                            dotLabels={dotLabels}
                            showBoardGuides={showBoardGuides}
                            activeColor={activeColor}
                            currentBoard={currentBoard}
                            solvedBoard={solvedBoard}
                            isSolving={invalidSavedWalls || isSolving || isGenerating || !isLoaded || !isAvailable}
                            isResetting={isResetting}
                            onCellClick={handleCellClick}
                            walls={walls}
                            editTool={editTool}
                            onWallsChange={applyWalls}
                            blocks={blocks} onBlockClick={toggleBlock}
                            endpointBoard={board} solution={visibleSolution} bridges={bridges} warps={warps}
                            onBridgeClick={toggleBridge} onSeamClick={toggleSeam}
                        />
                    </div>
                    <p className="sr-only" id="board-keyboard-help">Use arrow keys to move between cells. {editTool === 'blocks' ? 'Press Enter or Space to block or unblock a cell.' : editTool === 'warps' ? 'Press Shift and an outward arrow at a border to toggle a warp.' : editTool === 'bridges' ? 'Press Enter or Space to add or remove a bridge.' : editTool === 'walls' ? 'Press Shift and an arrow key to add or remove a wall on that side.' : 'Press Enter or Space to place or remove a dot.'}</p>
                    <p id="board-instructions" className="sr-only">{editTool === 'blocks' ? 'Select an empty cell to block it. Select a block to make it playable.' : editTool === 'warps' ? 'Tap a border to open or close an opposite-edge warp.' : editTool === 'bridges' ? 'Tap an empty interior cell to add or remove a bridge.' : editTool === 'walls' ? 'Tap or drag along lines between cells to add or remove walls. Cell centers and outer borders do not change.' : 'Tap an empty cell to place a dot. Tap a dot to remove it.'}</p>
                </section>
                <section aria-label="Game Controls" className="game-controls">
                    <SolverControls
                        showBoardGuides={showBoardGuides}
                        onBoardGuidesChange={changeBoardGuides}
                        showGenerator={showGenerator} onShowGeneratorChange={changeShowGenerator}
                        dotLabels={dotLabels} onDotLabelsChange={changeDotLabels}
                        onEdit={() => { setSolvedBoard(null); setPathSolution(null); setSolveTime(null); setFallbackUsed(false); setError(null); }}
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
                        blocks={blocks}
                        editTool={editTool}
                        onEditToolChange={tool => { setEditTool(tool); setError(null); }}
                        canUndo={canUndo}
                        onUndo={undoEdit}
                        warps={warps}
                        onWarpsChange={next => applyTopology({ walls, bridges, blocks, warps: next })}
                    />
                </section>
            </div>
        </main>
    );
};

export default FlowSolver;
