import { solve as solveAStar, type Board } from '../logic/astar-solver';
import { solveZ3 } from '../logic/z3-solver';
import { serializeBoard, solveHeuristicBFS, solveTopology } from '../logic/heuristic-solver';
import { requireStandardMode, type GameMode } from '../logic/game-modes';
import { normalizeTopology, validateBoard } from '../logic/topology';
import { boardToSolution, solutionBoard } from '../logic/solution';
import { SearchLimitError } from '../logic/solver-errors';

self.onmessage = async (event: MessageEvent<{
    board: Board; type: 'astar' | 'z3' | 'heuristic_bfs'; mode?: GameMode;
    walls?: unknown; bridges?: unknown; warps?: unknown;
    allowFallback?: boolean;
}>) => {
    const { board, type, mode = 'standard' } = event.data;
    try {
        validateBoard(board);
        serializeBoard(board); // Every algorithm requires exactly two endpoints per color.
        const topology = normalizeTopology(event.data, board, mode);
        if (!['astar', 'z3', 'heuristic_bfs'].includes(type)) throw new Error('Unknown solver algorithm');
        if ((mode !== 'standard' && type !== 'heuristic_bfs') ||
            (type === 'astar' && (topology.walls.length || board.length !== board[0].length))) {
            throw new Error(mode !== 'standard' ? 'This board requires the C/Wasm solver' : topology.walls.length ? 'Boards with walls require the C/Wasm solver' : 'Rectangular boards require the C/Wasm solver');
        }
        if (mode !== 'standard') {
            const result = await solveTopology(board, topology, mode);
            self.postMessage({ ...result, board: result.solution ? solutionBoard(board, result.solution) : null,
                timedOut: result.status === 'limit', timeTaken: 0 });
            return;
        }
        requireStandardMode(mode);
        const solveClassic = async () => {
            if (type === 'z3') return solveZ3(board, topology.walls);
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
