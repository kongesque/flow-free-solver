import type { Board } from '../logic/astar-solver';
import { serializeBoard, solveHeuristicBFS, solveTopology } from '../logic/heuristic-solver';
import { requireStandardMode, type GameMode } from '../logic/game-modes';
import { normalizeTopology, validateBoard, type PuzzleTopology } from '../logic/topology';
import { boardToSolution, solutionBoard, validateSolution, type PuzzleSolution } from '../logic/solution';
import { isSearchLimitError } from '../logic/solver-errors';
import type { Wall } from '../logic/walls';
import type { Block } from '../logic/blocks';

// Heuristic solves should not download or parse the SAT API. Load each other
// solver only when selected or when heuristic search actually needs fallback.
async function solveZ3(board: Board, walls: Wall[], blocks?: Block[]) {
    const { solveZ3 } = await import('../logic/z3-solver');
    return solveZ3(board, walls, blocks);
}

async function solveZ3Topology(board: Board, topology: PuzzleTopology, classicDegree = false, candidate?: PuzzleSolution) {
    const { solveZ3Topology } = await import('../logic/z3-topology-solver');
    return solveZ3Topology(board, topology, classicDegree, candidate);
}

self.onmessage = async (event: MessageEvent<{
    board: Board; type: 'astar' | 'z3' | 'heuristic_bfs'; mode?: GameMode;
    walls?: unknown; bridges?: unknown; warps?: unknown; blocks?: unknown;
    allowFallback?: boolean;
    satCandidate?: PuzzleSolution | null;
}>) => {
    const { board, type, mode = 'standard' } = event.data;
    let fallbackUsed = false;
    const startFallback = () => {
        fallbackUsed = true;
        self.postMessage({ kind: 'progress', phase: 'sat-fallback' });
    };
    try {
        validateBoard(board);
        serializeBoard(board); // Every algorithm requires exactly two endpoints per color.
        const topology = normalizeTopology(event.data, board, mode);
        if (!['astar', 'z3', 'heuristic_bfs'].includes(type)) throw new Error('Unknown solver algorithm');
        if (type === 'astar' && (mode !== 'standard' || topology.walls.length || board.length !== board[0].length)) {
            throw new Error('A* does not support this board. Choose Pruned DFS or SAT (Z3).');
        }
        if (type === 'z3') {
            const candidate = event.data.satCandidate ?? undefined;
            if (candidate) validateSolution(board, topology, candidate);
            let solution;
            if (mode === 'standard' && !candidate) {
                const result = await solveZ3(board, topology.walls, topology.blocks);
                solution = result ? boardToSolution(board, result, topology) : null;
            } else solution = await solveZ3Topology(board, topology, mode === 'standard', candidate);
            self.postMessage({ board: solution ? solutionBoard(board, solution) : null, solution,
                status: solution ? 'solved' : 'unsatisfiable', nodeCount: 0, timedOut: false, timeTaken: 0, fallbackUsed });
            return;
        }
        if (mode !== 'standard') {
            let result = await solveTopology(board, topology, mode);
            if (result.status === 'limit' && event.data.allowFallback !== false && self.crossOriginIsolated) {
                startFallback();
                const solution = await solveZ3Topology(board, topology);
                result = { solution, status: solution ? 'solved' : 'unsatisfiable', nodeCount: result.nodeCount };
            }
            self.postMessage({ ...result, board: result.solution ? solutionBoard(board, result.solution) : null,
                timedOut: result.status === 'limit', timeTaken: 0, fallbackUsed });
            return;
        }
        requireStandardMode(mode);
        const solveClassic = async () => {
            try { return await solveHeuristicBFS(board, topology.walls, topology.blocks); }
            catch (error) {
                if (!isSearchLimitError(error) || event.data.allowFallback === false || !self.crossOriginIsolated) throw error;
                startFallback();
                return solveZ3(board, topology.walls, topology.blocks);
            }
        };
        const result = type === 'astar' ? (await import('../logic/astar-solver')).solve(board, topology.blocks) : {
            board: await solveClassic(),
            timedOut: false, timeTaken: 0, nodeCount: 0,
        };
        self.postMessage({ ...result, status: result.board ? 'solved' : result.timedOut ? 'limit' : 'unsatisfiable',
            solution: result.board ? boardToSolution(board, result.board, topology) : null, fallbackUsed });
    } catch (error) {
        const limited = isSearchLimitError(error);
        self.postMessage({ board: null, solution: null, status: limited ? 'limit' : 'error', timedOut: limited,
            error: limited ? undefined : error instanceof Error ? error.message : String(error), timeTaken: 0, nodeCount: 0, fallbackUsed });
    }
};
