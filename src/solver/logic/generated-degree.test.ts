import { validateInducedSolution, validateSolution, type PuzzleSolution } from './solution';
import { generateModePuzzle } from './variant-generator';
import { assertInducedTopologySolution } from '../../../tests/fixtures/assert-topology-solution.mjs';

test('rejects the adjacent U-turn from the screenshot despite legal chosen steps', () => {
    const nodes = (cells: number[]) => cells.map(id => ({ x: id % 5, y: Math.floor(id / 5), lane: 'cell' as const }));
    const solution: PuzzleSolution = { version: 1, paths: [
        { color: 1, nodes: nodes([4, 3, 2, 1, 0, 5, 6, 7, 8, 9]) },
        ...[2, 3, 4].map((color, i) => ({ color, nodes: nodes(Array.from({ length: 5 }, (_, x) => (i + 2) * 5 + x)) })),
    ] };
    const board = Array.from({ length: 5 }, () => Array<number>(5).fill(0));
    for (const path of solution.paths) for (const node of [path.nodes[0], path.nodes.at(-1)!]) board[node.x][node.y] = path.color;
    const topology = { walls: [], bridges: [], warps: [] };
    expect(() => validateSolution(board, topology, solution)).not.toThrow();
    expect(() => validateInducedSolution(board, topology, solution)).toThrow('touches itself');
    expect(() => assertInducedTopologySolution({ width: 5, height: 5, mode: 'standard', board, topology, input: '' }, solution)).toThrow('same-color contact');
});

test('15x15 bridge regression keeps endpoints degree one and both crossing lanes degree two', () => {
    for (const seed of [0, 1, 42, 0xffffffff]) {
        const puzzle = generateModePuzzle(15, 15, 'bridges', seed);
        assertInducedTopologySolution({ ...puzzle, mode: 'bridges', input: '' }, puzzle.pathSolution);
    }
});
