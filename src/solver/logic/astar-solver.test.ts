import { solve } from './astar-solver';

describe('Solver', () => {
    test('solves a simple 2x2 board', () => {
        // Solvable 2x2 case where path must snake to fill board:
        // 1 1
        // 0 0
        // Path 1 needs to go from (0,0) to (0,1).
        // Direct path is length 2 (leaves 2 empty).
        // Snake path: (0,0) -> (1,0) -> (1,1) -> (0,1). Length 4. Fills board.

        const simpleBoard = [
            [1, 1],
            [0, 0]
        ];

        const result = solve(simpleBoard);
        expect(result.board).not.toBeNull();
        // Verify it's full (all cells are 1 because 0s are filled)
        if (result.board) {
            expect(result.board.flat().every(c => c === 1)).toBe(true);
        }
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
});
