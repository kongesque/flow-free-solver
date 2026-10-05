import { generatePuzzle, generateRectangularPuzzle } from './puzzle-generator';
import { serializeBoard } from './heuristic-solver';
import { assertSolution } from '../../../tests/fixtures/assert-solution.mjs';

const codes = ' RBYGOCMmPAWgTbcp';

for (let width = 5; width <= 15; width++) {
    test(`rectangular width ${width}: validates all other heights for three seeds`, () => {
        for (let height = 5; height <= 15; height++) {
            if (width === height) continue;
            for (let seed = 0; seed < 3; seed++) {
                const puzzle = generateRectangularPuzzle(width, height, seed);
                expect(puzzle.board).toHaveLength(width);
                expect(puzzle.board.every(column => column.length === height)).toBe(true);
                expect(puzzle.board.flat().filter(Boolean)).toHaveLength(puzzle.pairCount * 2);
                const solution = Array.from({ length: height }, (_, y) =>
                    Array.from({ length: width }, (_, x) => codes.charCodeAt(puzzle.solution[x][y])));
                assertSolution(serializeBoard(puzzle.board), solution);
            }
        }
    });
}

test('rejects invalid rectangular dimensions independently', () => {
    for (const dimension of [0, 4, 16, 5.5, NaN, Infinity]) {
        expect(() => generateRectangularPuzzle(dimension, 5, 1)).toThrow();
        expect(() => generateRectangularPuzzle(5, dimension, 1)).toThrow();
    }
});

for (let size = 5; size <= 15; size++) {
    test(`generates valid full-board ${size}x${size} path covers for 30 seeds`, () => {
        for (let seed = 0; seed < 30; seed++) {
            const puzzle = generatePuzzle(size, seed);
            const input = serializeBoard(puzzle.board);
            const solution = Array.from({ length: size }, (_, y) =>
                Array.from({ length: size }, (_, x) => codes.charCodeAt(puzzle.solution[x][y])));
            assertSolution(input, solution);
            expect(puzzle.board.flat().filter(Boolean)).toHaveLength(size * 2);
            expect(puzzle.pairCount).toBe(size);
            // Three cells or more per path, so pairs never start already connected.
            for (let color = 1; color <= size; color++) {
                expect(puzzle.solution.flat().filter(c => c === color).length).toBeGreaterThanOrEqual(3);
            }
        }
    });
}

test('seed reproduces a puzzle, including the zero and maximum seeds', () => {
    for (const seed of [0, 42, 0xffffffff]) {
        expect(generatePuzzle(8, seed)).toEqual(generatePuzzle(8, seed));
    }
});

test('different seeds produce different endpoint layouts and bent paths', () => {
    const layouts = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
        const { board, solution } = generatePuzzle(7, seed);
        layouts.add(JSON.stringify(board.map(column => column.map(Boolean))));
        const bent = solution.some((column, x) => column.some((color, y) =>
            (solution[x - 1]?.[y] === color || solution[x + 1]?.[y] === color) &&
            (solution[x]?.[y - 1] === color || solution[x]?.[y + 1] === color)));
        expect(bent).toBe(true);
    }
    expect(layouts.size).toBeGreaterThan(25);
});

test('endpoint board and solution are independent arrays', () => {
    const { board, solution } = generatePuzzle(5, 123);
    const original = solution.map(column => [...column]);
    board[0][0] = 16;
    expect(solution).toEqual(original);
});

test('rejects unsupported sizes and invalid seeds', () => {
    for (const size of [0, 4, 16, 5.5, NaN, Infinity]) {
        expect(() => generatePuzzle(size, 1)).toThrow('Grid size');
    }
    for (const seed of [-1, 2 ** 32, 0.5, NaN, Infinity]) {
        expect(() => generatePuzzle(5, seed)).toThrow('Seed');
    }
});
