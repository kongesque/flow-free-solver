import type { Board } from './astar-solver';
import { nodeKey, topologyGraph, type PathNode, type PuzzleTopology } from './topology';

export type PuzzleSolution = { version: 1; paths: { color: number; nodes: PathNode[] }[] };

/** Validate chosen steps, not inferred color adjacency. Also rejects detached cycles. */
export function validateSolution(board: Board, topology: PuzzleTopology, solution: PuzzleSolution): void {
    if (!solution || solution.version !== 1 || !Array.isArray(solution.paths)) throw new Error('Invalid solution');
    const graph = topologyGraph(board.length, board[0].length, topology);
    const ids = new Map(graph.nodes.map((node, id) => [nodeKey(node), id]));
    const occupied = new Map<number, number>();
    const endpoints = new Map<number, string[]>();
    board.forEach((column, x) => column.forEach((color, y) => {
        if (color) endpoints.set(color, [...(endpoints.get(color) ?? []), `${x},${y},cell`]);
    }));
    const colors = new Set<number>();
    for (const path of solution.paths) {
        if (!path || !Number.isInteger(path.color) || !Array.isArray(path.nodes)) throw new Error('Invalid path');
        const pair = endpoints.get(path.color);
        if (!pair || pair.length !== 2 || colors.has(path.color) || path.nodes.length < 2 || path.nodes.length > graph.nodes.length) throw new Error('Invalid path endpoints');
        colors.add(path.color);
        const keys = path.nodes.map(node => {
            if (!node || !Number.isInteger(node.x) || !Number.isInteger(node.y)) throw new Error('Invalid path node');
            return nodeKey(node);
        });
        if (!(pair.includes(keys[0]) && pair.includes(keys.at(-1)!) && keys[0] !== keys.at(-1))) throw new Error('Changed endpoints');
        let previous: number | undefined;
        keys.forEach((key, i) => {
            const id = ids.get(key);
            if (id === undefined || occupied.has(id)) throw new Error('Overlapping or invalid path node');
            const node = graph.nodes[id];
            if (i > 0 && i < keys.length - 1 && board[node.x][node.y]) throw new Error('Path crosses an endpoint');
            if (previous !== undefined && !graph.edges[previous].includes(id)) throw new Error('Illegal path step');
            occupied.set(id, path.color);
            previous = id;
        });
    }
    if (colors.size !== endpoints.size || occupied.size !== graph.nodes.length) throw new Error('Incomplete board coverage');
    topology.bridges.forEach(({ x, y }, i) => {
        if (occupied.get(y * board.length + x) === occupied.get(board.length * board[0].length + i)) throw new Error('A bridge cannot cross the same color');
    });
}

/** Legacy Standard solvers imply edges through open same-color adjacency. */
export function boardToSolution(board: Board, solved: Board, topology: PuzzleTopology): PuzzleSolution {
    if (solved.length !== board.length || solved.some(col => col.length !== board[0].length)) throw new Error('Invalid solution dimensions');
    board.forEach((col, x) => col.forEach((color, y) => {
        if (color && solved[x][y] !== color) throw new Error('Changed endpoints');
    }));
    const graph = topologyGraph(board.length, board[0].length, topology);
    const endpoints = new Map<number, number[]>();
    board.forEach((column, x) => column.forEach((color, y) => {
        if (color) endpoints.set(color, [...(endpoints.get(color) ?? []), y * board.length + x]);
    }));
    const solution: PuzzleSolution = { version: 1, paths: [] };
    for (const [color, pair] of endpoints) {
        if (pair.length !== 2) throw new Error('Invalid endpoints');
        const nodes: PathNode[] = [];
        const seen = new Set<number>();
        let id = pair[0], previous = -1;
        while (true) {
            if (seen.has(id)) throw new Error('Cyclic solution');
            seen.add(id); nodes.push(graph.nodes[id]);
            if (id === pair[1]) break;
            const neighbors = graph.edges[id].filter(n => n !== previous && solved[graph.nodes[n].x]?.[graph.nodes[n].y] === color);
            if (neighbors.length !== 1) throw new Error('Invalid Standard path degree');
            previous = id; id = neighbors[0];
        }
        solution.paths.push({ color, nodes });
    }
    validateSolution(board, topology, solution);
    return solution;
}

/** A display matrix for legacy labels; bridge lanes remain authoritative in paths. */
export function solutionBoard(board: Board, solution: PuzzleSolution): Board {
    const result = board.map(column => column.map(() => 0));
    for (const path of solution.paths) for (const node of path.nodes) {
        if (node.lane !== 'vertical') result[node.x][node.y] = path.color;
    }
    return result;
}
