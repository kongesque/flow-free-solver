import { solve as solveAStar, type Board } from '../logic/astar-solver';
import { serializeBoard, solveHeuristicBFS, solveTopology } from '../logic/heuristic-solver';
import { requireStandardMode, type GameMode } from '../logic/game-modes';
import { normalizeTopology, validateBoard } from '../logic/topology';
import { boardToSolution, solutionBoard, validateSolution, type PuzzleSolution } from '../logic/solution';
import { SearchLimitError } from '../logic/solver-errors';
import { solveZ3Topology } from '../logic/z3-topology-solver';
import { solveZ3 } from '../logic/z3-solver';

self.onmessage = async (event: MessageEvent<{
    board: Board; type: 'astar' | 'z3' | 'heuristic_bfs'; mode?: GameMode;
    walls?: unknown; bridges?: unknown; warps?: unknown;
    allowFallback?: boolean;
    satCandidate?: PuzzleSolution | null;
}>) => {
    const { board, type, mode = 'standard' } = event.data;
    try {
        validateBoard(board);
        serializeBoard(board); // Every algorithm requires exactly two endpoints per color.
        const topology = normalizeTopology(event.data, board, mode);
        if (!['astar', 'z3', 'heuristic_bfs'].includes(type)) throw new Error('Unknown solver algorithm');
        if (type === 'astar' && (mode !== 'standard' || topology.walls.length || board.length !== board[0].length)) {
            throw new Error('A* does not support this board. Choose Heuristic BFS or SAT (Z3).');
        }
        if (type === 'z3') {
            const candidate = event.data.satCandidate ?? undefined;
            if (candidate) validateSolution(board, topology, candidate);
            let solution;
            if (mode === 'standard' && !candidate) {
                const result = await solveZ3(board, topology.walls);
                solution = result ? boardToSolution(board, result, topology) : null;
            } else solution = await solveZ3Topology(board, topology, mode === 'standard', candidate);
            self.postMessage({ board: solution ? solutionBoard(board, solution) : null, solution,
                status: solution ? 'solved' : 'unsatisfiable', nodeCount: 0, timedOut: false, timeTaken: 0 });
            return;
        }
        if (mode !== 'standard') {
            let result = await solveTopology(board, topology, mode);
            if (result.status === 'limit' && event.data.allowFallback !== false && self.crossOriginIsolated) {
                const solution = await solveZ3Topology(board, topology);
                result = { solution, status: solution ? 'solved' : 'unsatisfiable', nodeCount: result.nodeCount };
            }
            self.postMessage({ ...result, board: result.solution ? solutionBoard(board, result.solution) : null,
                timedOut: result.status === 'limit', timeTaken: 0 });
            return;
        }
        requireStandardMode(mode);
        const solveClassic = async () => {
            try { return await solveHeuristicBFS(board, topology.walls); }
            catch (error) {
                if (!(error instanceof SearchLimitError) || event.data.allowFallback === false || !self.crossOriginIsolated) throw error;
                return solveZ3(board, topology.walls);
            }
        };
        const result = type === 'astar' ? solveAStar(board) : {
            board: await solveClassic(),
            timedOut: false, timeTaken: 0, nodeCount: 0,
        };
        self.postMessage({ ...result, status: result.board ? 'solved' : result.timedOut ? 'limit' : 'unsatisfiable',
            solution: result.board ? boardToSolution(board, result.board, topology) : null });
    } catch (error) {
        const limited = error instanceof SearchLimitError;
        self.postMessage({ board: null, solution: null, status: limited ? 'limit' : 'error', timedOut: limited,
            error: limited ? undefined : error instanceof Error ? error.message : String(error), timeTaken: 0, nodeCount: 0 });
    }
};
