import type { Board, Cell } from './astar-solver';
import { hasWall, type Wall } from './walls';

/** Degree constraints can also admit closed loops without endpoints. Find
 * those components so SAT can exclude them and continue toward a full cover.
 */
export function disconnectedLoops(board: Board, model: Board, walls: readonly Wall[]): Cell[][] {
    const width = board.length, height = board[0].length;
    const seen = new Set<number>(), loops: Cell[][] = [];
    for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
        if (seen.has(y * width + x)) continue;
        const color = model[x][y], cells: Cell[] = [], queue: Cell[] = [[x, y]];
        let hasEndpoint = false;
        while (queue.length) {
            const [cx, cy] = queue.pop()!;
            const id = cy * width + cx;
            if (seen.has(id)) continue;
            seen.add(id); cells.push([cx, cy]);
            hasEndpoint ||= board[cx][cy] !== 0;
            for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as Cell[]) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height && model[nx][ny] === color &&
                    !seen.has(ny * width + nx) && !hasWall(walls, [cx, cy], [nx, ny])) queue.push([nx, ny]);
            }
        }
        if (!hasEndpoint) loops.push(cells);
    }
    return loops;
}
