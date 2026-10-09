import { solve } from './astar-solver';
import { generatePuzzle } from './puzzle-generator';
import { serializeBoard } from './heuristic-solver';
import { assertSolution } from '../../../tests/fixtures/assert-solution.mjs';

describe('Solver', () => {
    test('solves a simple 2x2 board', () => {
        const simpleBoard = [
            [1, 1],
            [4, 4]
        ];

        const result = solve(simpleBoard);
        expect(result.board).not.toBeNull();
        expect(result.board).toEqual(simpleBoard);
    });

    test('returns null for unsolvable board', () => {
        // 1 2
        // 2 1
        const unsolvable = [
            [1, 2],
            [2, 1]
        ];
        const result = solve(unsolvable);
        expect(result.board).toBeNull();
    });

    test('random pair counts preserve sparse palette IDs and produce unbranched full covers', () => {
        const codes = ' RBYGOCMmPAWgTbcp';
        for (let seed = 0; seed < 100; seed++) {
            const puzzle = generatePuzzle(5, seed), input = structuredClone(puzzle.board);
            const result = solve(puzzle.board);
            expect(result.board, `seed ${seed}`).not.toBeNull();
            const rows = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => codes.charCodeAt(result.board![x][y])));
            assertSolution(serializeBoard(input), rows);
            expect(puzzle.board).toEqual(input);
        }
    });
});
