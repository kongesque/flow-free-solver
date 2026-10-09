import { generateModePuzzle } from './variant-generator';
import { maxGeneratedPairs } from './puzzle-generator';
import { assertInducedTopologySolution as assertTopologySolution } from '../../../tests/fixtures/assert-topology-solution.mjs';

for (const mode of ['bridges', 'warps'] as const) for (let width = 5; width <= 19; width++) {
    test(`${mode} width ${width}: validates every height, random pair counts and sparse crossings`, () => {
        for (let height = 5; height <= 19; height++) {
            const counts = new Set<number>();
            for (let seed = 0; seed < 12; seed++) {
                const puzzle = generateModePuzzle(width, height, mode, seed);
                assertTopologySolution({ ...puzzle, mode, input: '', solution: puzzle.pathSolution }, puzzle.pathSolution);
                counts.add(puzzle.pairCount);
                expect(puzzle.pairCount).toBeLessThanOrEqual(maxGeneratedPairs(width, height));
                const colors = [...new Set(puzzle.board.flat().filter(Boolean))].sort((a, b) => a - b);
                expect(colors).toEqual([1, 4, 2, 3, 5, 6, 7, 8, 9, 11, 10, 12, 13, 14, 15, 16]
                    .slice(0, puzzle.pairCount).sort((a, b) => a - b));
                expect(puzzle.topology[mode].length).toBeGreaterThan(0);
                if (mode === 'bridges') {
                    expect(puzzle.topology.bridges.length).toBeLessThanOrEqual(3);
                    for (const [i, a] of puzzle.topology.bridges.entries()) for (const b of puzzle.topology.bridges.slice(i + 1)) {
                        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(3);
                    }
                }
                if (mode === 'warps') expect(puzzle.pathSolution.paths.some(path => path.nodes.some((node, i) =>
                    i > 0 && Math.abs(node.x - path.nodes[i - 1].x) + Math.abs(node.y - path.nodes[i - 1].y) > 1))).toBe(true);
            }
            expect(counts.size).toBeGreaterThan(1);
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

for (const mode of ['standard', 'bridges', 'warps'] as const) for (const size of [17, 18, 19]) {
    test(`${mode} ${size}x${size} varies pair counts and reaches all 16 colors`, () => {
        const counts = new Set<number>();
        for (let seed = 0; seed < 40; seed++) {
            const puzzle = generateModePuzzle(size, size, mode, seed);
            assertTopologySolution({ ...puzzle, mode, input: '' }, puzzle.pathSolution);
            counts.add(puzzle.pairCount);
            expect(puzzle.pairCount).toBeLessThanOrEqual(16);
        }
        expect(counts.size).toBeGreaterThan(4);
        expect(counts.has(16)).toBe(true);
    });
}

test('rejects invalid dimensions, seeds and unavailable modes', () => {
    for (const mode of ['standard', 'bridges', 'warps'] as const) {
        expect(() => generateModePuzzle(4, 5, mode, 1)).toThrow('Grid size');
        expect(() => generateModePuzzle(5, 20, mode, 1)).toThrow('Grid size');
        expect(() => generateModePuzzle(5, 5, mode, -1)).toThrow('Seed');
    }
    expect(() => generateModePuzzle(5, 5, 'hexes', 1)).toThrow('not available yet');
});

test('larger bridge boards generate one, two and three crossings across seeds', () => {
    const counts = new Set(Array.from({ length: 40 }, (_, seed) => generateModePuzzle(11, 11, 'bridges', seed).topology.bridges.length));
    expect([...counts].sort()).toEqual([1, 2, 3]);
});
