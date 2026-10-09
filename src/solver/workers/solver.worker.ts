import { solve as solveAStar, type Board } from '../logic/astar-solver';
import { solveZ3 } from '../logic/z3-solver';
import { solveHeuristicBFS, solveTopology } from '../logic/heuristic-solver';
import { requireStandardMode, type GameMode } from '../logic/game-modes';
import { normalizeTopology, validateBoard } from '../logic/topology';
import { boardToSolution, solutionBoard } from '../logic/solution';

self.onmessage = async (event: MessageEvent<{
    board: Board; type: 'astar' | 'z3' | 'heuristic_bfs'; mode?: GameMode;
    walls?: unknown; bridges?: unknown; warps?: unknown;
}>) => {
    const { board, type, mode = 'standard' } = event.data;
    try {
        validateBoard(board);
        const topology = normalizeTopology(event.data, board, mode);
        if (!['astar', 'z3', 'heuristic_bfs'].includes(type)) throw new Error('Unknown solver algorithm');
        if ((mode !== 'standard' || topology.walls.length || board.length !== board[0].length) && type !== 'heuristic_bfs') {
            throw new Error(mode !== 'standard' ? 'This board requires the C/Wasm solver' : topology.walls.length ? 'Boards with walls require the C/Wasm solver' : 'Rectangular boards require the C/Wasm solver');
        }
        if (mode !== 'standard') {
            const result = await solveTopology(board, topology, mode);
            self.postMessage({ ...result, board: result.solution ? solutionBoard(board, result.solution) : null,
                timedOut: result.status === 'limit', timeTaken: 0 });
            return;
        }
        requireStandardMode(mode);
        const result = type === 'astar' ? solveAStar(board) : {
            board: type === 'z3' ? await solveZ3(board) : await solveHeuristicBFS(board, topology.walls),
            timedOut: false, timeTaken: 0, nodeCount: 0,
        };
        self.postMessage({ ...result, status: result.board ? 'solved' : result.timedOut ? 'limit' : 'unsatisfiable',
            solution: result.board ? boardToSolution(board, result.board, topology) : null });
    } catch (error) {
        self.postMessage({ board: null, solution: null, status: 'error', timedOut: false,
            error: error instanceof Error ? error.message : String(error), timeTaken: 0, nodeCount: 0 });
    }
};
