import { COLOR_PLACEMENT_ORDER } from './color-order.ts';
import { MAX_BOARD_SIZE } from './board-limits.ts';

export interface GeneratedPuzzle {
    /** Boards use the editor's column-major [x][y] coordinates. */
    width: number;
    height: number;
    board: number[][];
    solution: number[][];
    seed: number;
    pairCount: number;
}

export function validateGeneratorInputs(width: number, height: number, seed: number): void {
    if ([width, height].some(dimension => !Number.isInteger(dimension) || dimension < 5 || dimension > MAX_BOARD_SIZE)) {
        throw new Error(`Grid size must be an integer from 5 to ${MAX_BOARD_SIZE}`);
    }
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        throw new Error('Seed must be an unsigned 32-bit integer');
    }
}

export function createPuzzleRandom(seed: number): (limit: number) => number {
    let randomState = seed;
    return (limit: number) => {
        randomState = (randomState + 0x6d2b79f5) >>> 0;
        let value = Math.imul(randomState ^ (randomState >>> 15), randomState | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return Math.floor(((value ^ (value >>> 14)) >>> 0) / 2 ** 32 * limit);
    };
}

/** Build a full path cover, then expose only each path's two endpoints.
 * Moving a cell between path endpoints preserves coverage and connectivity.
 * The degree check prevents paths from touching themselves or branching.
 * Solvability is guaranteed by construction; uniqueness is not guaranteed.
 */
export function generateRectangularPuzzle(width: number, height: number, seed = Math.floor(Math.random() * 2 ** 32)): GeneratedPuzzle {
    validateGeneratorInputs(width, height, seed);
    const random = createPuzzleRandom(seed);
    const neighbors = Array.from({ length: width * height }, (_, cell) => {
        const x = cell % width;
        const y = Math.floor(cell / width);
        return [x > 0 ? cell - 1 : -1, x < width - 1 ? cell + 1 : -1,
            y > 0 ? cell - width : -1, y < height - 1 ? cell + width : -1].filter(n => n >= 0);
    });
    const maxPairs = COLOR_PLACEMENT_ORDER.length;
    let vertical = random(2) === 1;
    if (width > maxPairs && height <= maxPairs) vertical = false;
    if (height > maxPairs && width <= maxPairs) vertical = true;
    const paths = width > maxPairs && height > maxPairs ? ringCover(width, height) :
        Array.from({ length: vertical ? width : height }, (_, line) =>
            Array.from({ length: vertical ? height : width }, (_, offset) => vertical ? offset * width + line : line * width + offset));
    // Large boards start from an induced ring cover. Split its paths to vary
    // the pair count up to the full palette without losing a known solution.
    if (width > maxPairs && height > maxPairs) {
        const target = paths.length + random(maxPairs - paths.length + 1);
        while (paths.length < target) {
            const candidates = paths.map((path, index) => path.length >= 6 ? index : -1).filter(index => index >= 0);
            const index = candidates[random(candidates.length)];
            const path = paths[index], cut = 3 + random(path.length - 5);
            paths.splice(index, 1, path.slice(0, cut), path.slice(cut));
        }
    }
    const pairCount = paths.length;
    const owner = new Int16Array(width * height);
    paths.forEach((path, color) => path.forEach(cell => { owner[cell] = color; }));

    // Bounded work: at most 144,400 local move attempts on a 19x19 board.
    for (let attempt = 0; attempt < width * height * 400; attempt++) {
        const color = random(pairCount);
        const path = paths[color];
        const front = random(2) === 0;
        const end = front ? path[0] : path[path.length - 1];
        const adjacent = neighbors[end];
        const cell = adjacent[random(adjacent.length)];
        const donorColor = owner[cell];
        if (donorColor === color) continue;
        const donor = paths[donorColor];
        // Keep at least three cells per pair, with distinct, non-adjacent endpoints.
        if (donor.length <= 3) continue;
        const donorFront = donor[0] === cell;
        if (!donorFront && donor[donor.length - 1] !== cell) continue;
        if (neighbors[cell].filter(n => owner[n] === color).length !== 1) continue;

        if (donorFront) donor.shift();
        else donor.pop();
        if (front) path.unshift(cell);
        else path.push(cell);
        owner[cell] = color;
    }

    const colors = COLOR_PLACEMENT_ORDER.slice(0, pairCount);
    for (let i = colors.length - 1; i > 0; i--) {
        const j = random(i + 1);
        [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    const board = Array.from({ length: width }, () => Array<number>(height).fill(0));
    const solution = Array.from({ length: width }, () => Array<number>(height).fill(0));
    paths.forEach((path, index) => {
        const color = colors[index];
        for (const cell of path) solution[cell % width][Math.floor(cell / width)] = color;
        for (const cell of [path[0], path[path.length - 1]]) board[cell % width][Math.floor(cell / width)] = color;
    });
    return { width, height, board, solution, seed, pairCount };
}

/** Nested open rings cover large boards with at most 11 colors. Each ring
 * leaves one cell for the next path, preventing a cycle or self-touching.
 */
function ringCover(width: number, height: number): number[][] {
    const paths: number[][] = [];
    let previousGap: number | undefined;
    for (let inset = 0; inset * 2 < Math.min(width, height); inset++) {
        const left = inset, top = inset, right = width - inset - 1, bottom = height - inset - 1;
        const cell = (x: number, y: number) => y * width + x;
        const prefix = previousGap === undefined ? [] : [previousGap];
        if (right - left <= 1 || bottom - top <= 1) {
            // A final one/two-column or one/two-row strip stays induced by
            // assigning each line its own path rather than making a tight U.
            if (right - left <= bottom - top) {
                for (let x = left; x <= right; x++) paths.push([
                    ...(x === left ? prefix : []),
                    ...Array.from({ length: bottom - top + 1 }, (_, i) => cell(x, top + i)),
                ]);
            } else {
                for (let y = top; y <= bottom; y++) paths.push([
                    ...(y === top ? prefix : []),
                    ...Array.from({ length: right - left + 1 }, (_, i) => cell(left + i, y)),
                ]);
            }
            break;
        }
        const path = [...prefix];
        for (let y = top; y <= bottom; y++) path.push(cell(left, y));
        for (let x = left + 1; x <= right; x++) path.push(cell(x, bottom));
        for (let y = bottom - 1; y >= top; y--) path.push(cell(right, y));
        for (let x = right - 1; x > left + 1; x--) path.push(cell(x, top));
        paths.push(path);
        previousGap = cell(left + 1, top);
    }
    return paths;
}

/** Square-board convenience API retained for existing callers. */
export function generatePuzzle(size: number, seed?: number): GeneratedPuzzle {
    return generateRectangularPuzzle(size, size, seed);
}
