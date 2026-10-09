import { COLOR_PLACEMENT_ORDER } from './color-order.ts';

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
    if ([width, height].some(dimension => !Number.isInteger(dimension) || dimension < 5 || dimension > 15)) {
        throw new Error('Grid size must be an integer from 5 to 15');
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
    const vertical = random(2) === 1;
    const pairCount = vertical ? width : height;
    const paths = Array.from({ length: pairCount }, (_, line) =>
        Array.from({ length: vertical ? height : width }, (_, offset) => vertical ? offset * width + line : line * width + offset));
    const owner = new Int16Array(width * height);
    paths.forEach((path, color) => path.forEach(cell => { owner[cell] = color; }));

    // Bounded work: even a 15x15 board takes only 90,000 local move attempts.
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

/** Square-board convenience API retained for existing callers. */
export function generatePuzzle(size: number, seed?: number): GeneratedPuzzle {
    return generateRectangularPuzzle(size, size, seed);
}
