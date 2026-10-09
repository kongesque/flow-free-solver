import { generateModePuzzle } from './variant-generator';
import { assertTopologySolution } from '../../../tests/fixtures/assert-topology-solution.mjs';

for (const mode of ['bridges', 'warps'] as const) for (let width = 5; width <= 15; width++) {
    test(`${mode} width ${width}: independently validates every height and three seeds`, () => {
        for (let height = 5; height <= 15; height++) for (let seed = 0; seed < 3; seed++) {
            const puzzle = generateModePuzzle(width, height, mode, seed);
            assertTopologySolution({ ...puzzle, mode, input: '', solution: puzzle.pathSolution }, puzzle.pathSolution);
            expect(puzzle.pairCount).toBeLessThanOrEqual(16);
            expect(puzzle.topology[mode].length).toBeGreaterThan(0);
            if (mode === 'warps') expect(puzzle.pathSolution.paths.some(path => path.nodes.some((node, i) =>
                i > 0 && Math.abs(node.x - path.nodes[i - 1].x) + Math.abs(node.y - path.nodes[i - 1].y) > 1))).toBe(true);
        }
    });
}

test('all supported modes reproduce their seed and keep endpoint/solution arrays independent', () => {
    for (const mode of ['standard', 'bridges', 'warps'] as const) for (const seed of [0, 42, 0xffffffff]) {
        const puzzle = generateModePuzzle(8, 5, mode, seed);
        expect(puzzle).toEqual(generateModePuzzle(8, 5, mode, seed));
        const original = structuredClone(puzzle.solution);
        puzzle.board[0][0] = 16;
        expect(puzzle.solution).toEqual(original);
    }
});

test('variant generation varies both endpoint layouts and topology', () => {
    for (const mode of ['bridges', 'warps'] as const) {
        const puzzles = Array.from({ length: 30 }, (_, seed) => generateModePuzzle(8, 8, mode, seed));
        expect(new Set(puzzles.map(p => JSON.stringify(p.board.map(column => column.map(Boolean))))).size).toBeGreaterThan(25);
        expect(new Set(puzzles.map(p => JSON.stringify(p.topology))).size).toBeGreaterThan(10);
    }
});

test('rejects invalid dimensions, seeds and unavailable modes', () => {
    for (const mode of ['standard', 'bridges', 'warps'] as const) {
        expect(() => generateModePuzzle(4, 5, mode, 1)).toThrow('Grid size');
        expect(() => generateModePuzzle(5, 16, mode, 1)).toThrow('Grid size');
        expect(() => generateModePuzzle(5, 5, mode, -1)).toThrow('Seed');
    }
    expect(() => generateModePuzzle(5, 5, 'hexes', 1)).toThrow('not available yet');
});
