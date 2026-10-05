export interface GeneratedPuzzle {
    /** Boards use the editor's column-major [x][y] coordinates. */
    board: number[][];
    solution: number[][];
    seed: number;
    pairCount: number;
}

/** Build a full path cover, then expose only each path's two endpoints.
 * Moving a cell between path endpoints preserves coverage and connectivity.
 * The degree check prevents paths from touching themselves or branching.
 * Solvability is guaranteed by construction; uniqueness is not guaranteed.
 */
export function generatePuzzle(size: number, seed = Math.floor(Math.random() * 2 ** 32)): GeneratedPuzzle {
    if (!Number.isInteger(size) || size < 5 || size > 15) {
        throw new Error('Grid size must be an integer from 5 to 15');
    }
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        throw new Error('Seed must be an unsigned 32-bit integer');
    }

    let randomState = seed;
    const random = (limit: number) => {
        randomState = (randomState + 0x6d2b79f5) >>> 0;
        let value = Math.imul(randomState ^ (randomState >>> 15), randomState | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return Math.floor(((value ^ (value >>> 14)) >>> 0) / 2 ** 32 * limit);
    };
    const neighbors = Array.from({ length: size * size }, (_, cell) => {
        const x = cell % size;
        const y = Math.floor(cell / size);
        return [x > 0 ? cell - 1 : -1, x < size - 1 ? cell + 1 : -1,
            y > 0 ? cell - size : -1, y < size - 1 ? cell + size : -1].filter(n => n >= 0);
    });
    const vertical = random(2) === 1;
    const paths = Array.from({ length: size }, (_, line) =>
        Array.from({ length: size }, (_, offset) => vertical ? offset * size + line : line * size + offset));
    const owner = new Int16Array(size * size);
    paths.forEach((path, color) => path.forEach(cell => { owner[cell] = color; }));

    // Bounded work: even a 15x15 board takes only 90,000 local move attempts.
    for (let attempt = 0; attempt < size * size * 400; attempt++) {
        const color = random(size);
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

    const colors = Array.from({ length: size }, (_, i) => i + 1);
    for (let i = colors.length - 1; i > 0; i--) {
        const j = random(i + 1);
        [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    const board = Array.from({ length: size }, () => Array<number>(size).fill(0));
    const solution = Array.from({ length: size }, () => Array<number>(size).fill(0));
    paths.forEach((path, index) => {
        const color = colors[index];
        for (const cell of path) solution[cell % size][Math.floor(cell / size)] = color;
        for (const cell of [path[0], path[path.length - 1]]) board[cell % size][Math.floor(cell / size)] = color;
    });
    return { board, solution, seed, pairCount: size };
}
