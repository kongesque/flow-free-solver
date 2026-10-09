// @ts-ignore
import { init as lowLevelInit } from 'z3-solver/build/low-level/wrapper.__GENERATED__';
// @ts-ignore
import { createApi } from 'z3-solver/build/high-level';
import type { Board } from './astar-solver';
import { hasWall, normalizeWalls, type Wall } from './walls';
import { disconnectedLoops } from './sat-connectivity';
import { SearchLimitError } from './solver-errors';
import { boardToSolution } from './solution';

export async function createZ3Context() {
    const baseUrl = import.meta.env.BASE_URL;
    if (import.meta.env.DEV) console.log('[Z3Solver] Dynamically importing Z3 module');

    // dynamic import z3 bc it's huge
    // @ts-ignore  
    const { default: initZ3 } = await import('z3-solver/build/z3-built');

    if (import.meta.env.DEV) console.log('[Z3Solver] Z3 module imported successfully');

    if (import.meta.env.DEV) console.log('[Z3Solver] Initializing Z3');

    // Initialize the Emscripten module with locateFile for WASM and worker
    const emModule = await initZ3({
        locateFile: (path: string) => {
            if (path.endsWith('.wasm')) {
                if (import.meta.env.DEV) console.log(`[Z3Solver] locateFile for WASM: ${path}`);
                return baseUrl + 'wasm/z3-built.wasm';
            }
            if (path.endsWith('.worker.js')) {
                if (import.meta.env.DEV) console.log(`[Z3Solver] locateFile for worker: ${path}`);
                return baseUrl + 'wasm/z3-built.worker.js';
            }
            if (import.meta.env.DEV) console.log(`[Z3Solver] locateFile for unknown: ${path}`);
            return path;
        },
        mainScriptUrlOrBlob: baseUrl + 'wasm/z3-built.js'
    });

    // Build low-level API from the initialized Emscripten module
    const lowLevel = await lowLevelInit(() => Promise.resolve(emModule));

    // Build high-level API from low-level
    const highLevel = createApi(lowLevel.Z3);

    return highLevel.Context('main');
}

export async function solveZ3(board: Board, inputWalls: Wall[] = []): Promise<Board | null> {
    const started = performance.now();
    const budgetMs = 30_000;
    const walls = normalizeWalls(inputWalls, board.length, board[0].length);
    const colors = [...new Set(board.flat().filter(Boolean))];
    const { Solver, Int, Sum, If, Or } = await createZ3Context();

    const solver = new Solver();
    const M = board.length;
    const N = board[0].length;

    // Create variables B_i_j
    const B: any[][] = [];
    for (let i = 0; i < M; i++) {
        const row: any[] = [];
        for (let j = 0; j < N; j++) {
            row.push(Int.const(`B_${i}_${j}`));
        }
        B.push(row);
    }

    // Add constraints
    for (let i = 0; i < M; i++) {
        for (let j = 0; j < N; j++) {
            if (board[i][j] > 0) {
                // Fixed value
                solver.add(B[i][j].eq(board[i][j]));
            } else {
                // Only colors with actual endpoint pairs may occupy cells.
                solver.add(Or(...colors.map(color => B[i][j].eq(color))));
            }
        }
    }

    // Neighbor constraints
    for (let i = 0; i < M; i++) {
        for (let j = 0; j < N; j++) {
            const neighbors: any[] = [];

            // Check 4 directions
            const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dx, dy] of directions) {
                const ni = i + dx;
                const nj = j + dy;

                if (ni >= 0 && ni < M && nj >= 0 && nj < N && !hasWall(walls, [i, j], [ni, nj])) {
                    // neighbor same color? +1
                    neighbors.push(If(B[i][j].eq(B[ni][nj]), 1, 0));
                }
            }

            if (!neighbors.length) return null;
            const neighsSum = Sum(...(neighbors as [any, ...any[]]));

            if (board[i][j] > 0) {
                // Endpoint: must have exactly 1 neighbor of same color
                solver.add(neighsSum.eq(1));
            } else {
                // path needs exactly 2 neighbors (in/out)
                solver.add(neighsSum.eq(2));
            }
        }
    }

    // Refine models that satisfy local degrees but contain disconnected loops.
    // All iterations share one time budget; unknown is a limit, never unsat.
    while (true) {
        const remaining = budgetMs - (performance.now() - started);
        if (remaining <= 0) throw new SearchLimitError();
        solver.set('timeout', Math.max(1, Math.floor(remaining)));
        const check = await solver.check();
        if (check === 'unsat') return null;
        if (check !== 'sat') throw new SearchLimitError();
        const model = solver.model();
        const solvedBoard: Board = board.map(row => [...row]);

        for (let i = 0; i < M; i++) {
            for (let j = 0; j < N; j++) {
                const val = model.eval(B[i][j]);
                const sVal = (val as any).asString();
                solvedBoard[i][j] = parseInt(sVal);
            }
        }
        const loops = disconnectedLoops(board, solvedBoard, walls);
        if (!loops.length) {
            boardToSolution(board, solvedBoard, { walls, bridges: [], warps: [] });
            return solvedBoard;
        }
        for (const cells of loops) {
            const [x, y] = cells[0], color = solvedBoard[x][y];
            solver.add(Or(...cells.map(([cx, cy]) => B[cx][cy].neq(color))));
        }
    }
}
