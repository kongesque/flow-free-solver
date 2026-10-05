// worker thread to keep ui smooth

import { solve as solveAStar } from '../logic/astar-solver.js';
import { solveZ3 } from '../logic/z3-solver.js';


import { solveHeuristicBFS } from '../logic/heuristic-solver';

self.onmessage = async (event: MessageEvent<{ board: number[][], type: 'astar' | 'z3' | 'heuristic_bfs' }>) => {
    const { board, type } = event.data;

    if (!Array.isArray(board) || board.length === 0 || !Array.isArray(board[0])) {
        self.postMessage({ board: null, timedOut: false, error: 'Invalid board format', timeTaken: 0, nodeCount: 0 });
        return;
    }


    try {
        if (type === 'z3') {
            const result = await solveZ3(board);
            if (result) {
                self.postMessage({ board: result, timedOut: false, timeTaken: 0, nodeCount: 0 });
            } else {
                self.postMessage({ board: null, timedOut: false, timeTaken: 0, nodeCount: 0 });
            }
        } else if (type === 'heuristic_bfs') {
            const result = await solveHeuristicBFS(board);
            if (result) {
                self.postMessage({ board: result, timedOut: false, timeTaken: 0, nodeCount: 0 });
            } else {
                self.postMessage({ board: null, timedOut: false, timeTaken: 0, nodeCount: 0 });
            }
        } else {
            const result = solveAStar(board);
            self.postMessage(result);
        }
    } catch (e) {
        console.error(e);
        self.postMessage({ board: null, timedOut: false, error: String(e), timeTaken: 0, nodeCount: 0 });
    }
};
