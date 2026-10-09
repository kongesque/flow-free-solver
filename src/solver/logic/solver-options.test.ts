import { compatibleSolver } from './solver-options';

test('SAT stays selected in every supported mode, size, shape and wall configuration', () => {
    for (const mode of ['standard', 'bridges', 'warps'] as const) for (let width = 5; width <= 19; width++) {
        for (let height = 5; height <= 19; height++) for (const walls of [0, 10]) {
            expect(compatibleSolver('z3', mode, width, height, walls)).toBe('z3');
            expect(compatibleSolver('heuristic_bfs', mode, width, height, walls)).toBe('heuristic_bfs');
            expect(compatibleSolver('astar', mode, width, height, walls)).toBe(
                mode === 'standard' && width === height && walls === 0 ? 'astar' : 'heuristic_bfs');
        }
    }
});
