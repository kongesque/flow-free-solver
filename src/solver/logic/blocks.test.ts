import { blockKey, normalizeBlocks } from './blocks';
import { normalizeTopology, topologyGraph } from './topology';
import { boardToSolution, solutionBoard, validateInducedSolution, validateSolution } from './solution';
import { parseSolution, serializeBoard } from './heuristic-solver';
import { solve } from './astar-solver';
import { blockBridge, blockRows } from '../../../tests/fixtures/block-puzzles.mjs';
import { assertInducedTopologySolution, assertTopologySolution } from '../../../tests/fixtures/assert-topology-solution.mjs';

test('Blocks normalize old saves, duplicates and coordinates without hiding dots', () => {
    const f = blockRows();
    expect(normalizeBlocks(undefined, f.board)).toEqual([]);
    expect(normalizeBlocks([{ x: 4, y: 4 }, { x: 0, y: 0 }, { x: 4, y: 4 }], f.board)).toEqual([{ x: 0, y: 0 }, { x: 4, y: 4 }]);
    for (const input of [null, {}, [{ x: -1, y: 0 }], [{ x: 5, y: 0 }], [{ x: 0, y: 1.5 }], [{ x: 1, y: 0 }]]) {
        expect(() => normalizeBlocks(input, f.board)).toThrow();
    }
});

for (const f of [blockRows(), blockRows(19, 5), blockRows(5, 19, 'warps'), blockBridge(19, 19)]) {
    test(`Blocks graph and independent coverage: ${f.mode} ${f.width}x${f.height}`, () => {
        const topology = normalizeTopology(f.topology, f.board, f.mode);
        const graph = topologyGraph(f.width, f.height, topology);
        const blocked = new Set(topology.blocks!.map(blockKey));
        graph.nodes.forEach((node, id) => {
            expect(graph.active[id]).toBe(!blocked.has(blockKey(node)));
            if (!graph.active[id]) expect(graph.edges[id]).toEqual([]);
            graph.edges[id].forEach(n => { expect(graph.active[n]).toBe(true); expect(graph.edges[n]).toContain(id); });
        });
        validateSolution(f.board, topology, f.solution);
        assertTopologySolution(f, f.solution);
        const display = solutionBoard(f.board, f.solution);
        for (const { x, y } of topology.blocks!) expect(display[x][y]).toBe(0);
        expect(serializeBoard(f.board, topology.blocks)).toBe(f.input);
        const incomplete = structuredClone(f.solution); incomplete.paths.pop();
        expect(() => validateSolution(f.board, topology, incomplete)).toThrow();
        expect(() => assertTopologySolution(f, incomplete)).toThrow();
    });
}

test('Blocks reject a path or matrix filling unused cells', () => {
    const f = blockRows(), solution = structuredClone(f.solution);
    solution.paths[0].nodes.splice(1, 0, { x: 0, y: 0, lane: 'cell' });
    expect(() => validateSolution(f.board, f.topology, solution)).toThrow('invalid path node');
    expect(() => assertTopologySolution(f, solution)).toThrow('block');
    const matrix = solutionBoard(f.board, f.solution); matrix[0][0] = 1;
    expect(() => boardToSolution(f.board, matrix, f.topology)).toThrow('blocked cell');
});

test('Blocks parsing permits zero only at declared unused cells', () => {
    const f = blockRows(), matrix = solutionBoard(f.board, f.solution);
    const codes = Array.from({ length: 5 }, (_, y) => matrix.map(column => '.RBYGOCMmPAWgTbcp'.charCodeAt(column[y]) * Number(column[y] !== 0)));
    expect(parseSolution(JSON.stringify(codes), 5, 5, f.topology.blocks)).toEqual(matrix);
    expect(() => parseSolution(JSON.stringify(codes), 5)).toThrow();
    codes[0][0] = 82;
    expect(() => parseSolution(JSON.stringify(codes), 5, 5, f.topology.blocks)).toThrow('blocked cell');
});

test('Blocks preserve bridge lanes and reject impossible crossings or seams', () => {
    const f = blockBridge();
    for (const block of [{ x: 2, y: 2 }, { x: 2, y: 1 }]) expect(() => normalizeTopology({ ...f.topology, blocks: [block] }, f.board, f.mode)).toThrow();
    const warp = blockRows(5, 5, 'warps');
    expect(() => normalizeTopology({ ...warp.topology, warps: [{ axis: 'horizontal', index: 0 }] }, warp.board, 'warps')).toThrow('border blocks');
});

test('A* covers playable cells, preserving empty blocks and nonconsecutive palette colors', () => {
    const f = blockRows();
    const result = solve(f.board, f.topology.blocks);
    expect(result.board).not.toBeNull();
    const solution = boardToSolution(f.board, result.board!, f.topology);
    validateInducedSolution(f.board, f.topology, solution);
    assertInducedTopologySolution(f, solution);
    const board = Array.from({ length: 5 }, () => Array(5).fill(0)); board[0][0] = board[1][0] = 4;
    const blocks = Array.from({ length: 25 }, (_, id) => ({ x: id % 5, y: Math.floor(id / 5) })).filter(n => !(n.y === 0 && n.x < 2));
    expect(solve(board, blocks).board).toEqual(board);
});
