import type { GameMode } from './game-modes';
import { COLOR_PLACEMENT_ORDER } from './color-order';
import { createPuzzleRandom, generateRectangularPuzzle, validateGeneratorInputs, type GeneratedPuzzle } from './puzzle-generator';
import { boardToSolution, solutionBoard, validateSolution, type PuzzleSolution } from './solution';
import { normalizeTopology, topologyGraph, seamKey, type PuzzleTopology } from './topology';

export type GeneratedModePuzzle = GeneratedPuzzle & {
    mode: GameMode;
    topology: PuzzleTopology;
    pathSolution: PuzzleSolution;
};

/** Generate a complete, validated cover with the selected mode's topology.
 * Paths are retained explicitly because bridge lanes cannot share a matrix.
 * Construction is bounded and does not depend on a solver finding a puzzle.
 */
export function generateModePuzzle(width: number, height: number, mode: GameMode, seed: number): GeneratedModePuzzle {
    validateGeneratorInputs(width, height, seed);
    if (!['standard', 'bridges', 'warps'].includes(mode)) throw new Error(`${mode} mode is not available yet`);
    const random = createPuzzleRandom(seed);
    let topology: PuzzleTopology = { walls: [], bridges: [], warps: [] };
    let board: number[][];
    let pathSolution: PuzzleSolution;

    if (mode !== 'bridges') {
        const puzzle = generateRectangularPuzzle(width, height, seed);
        pathSolution = boardToSolution(puzzle.board, puzzle.solution, topology);
        if (mode === 'warps') {
            // Move one used edge across the border, ensuring every generated
            // warp puzzle actually needs at least one seam in its saved cover.
            const path = pathSolution.paths[random(pathSolution.paths.length)];
            const step = random(path.nodes.length - 1);
            const a = path.nodes[step], b = path.nodes[step + 1];
            const shiftX = a.x !== b.x ? width - Math.max(a.x, b.x) : random(width);
            const shiftY = a.y !== b.y ? height - Math.max(a.y, b.y) : random(height);
            for (const path of pathSolution.paths) path.nodes = path.nodes.map(node => ({
                ...node, x: (node.x + shiftX) % width, y: (node.y + shiftY) % height,
            }));
            const seams = new Map<string, PuzzleTopology['warps'][number]>();
            for (const path of pathSolution.paths) for (let i = 1; i < path.nodes.length; i++) {
                const a = path.nodes[i - 1], b = path.nodes[i];
                if (Math.abs(a.x - b.x) > 1) {
                    const seam = { axis: 'horizontal' as const, index: a.y };
                    seams.set(seamKey(seam), seam);
                }
                if (Math.abs(a.y - b.y) > 1) {
                    const seam = { axis: 'vertical' as const, index: a.x };
                    seams.set(seamKey(seam), seam);
                }
            }
            topology.warps = [...seams.values()];
        }
        board = endpoints(width, height, pathSolution);
    } else {
        // A straight route crosses row routes through an interior column.
        // Join two boundary fragments to neighboring row routes to keep the
        // cover within the editor's 16 colors, even on a 15x15 board.
        const transpose = random(2) === 1;
        const w = transpose ? height : width, h = transpose ? width : height;
        const column = 2 + random(w - 4);
        const top = random(h - 2), bottom = top + 2 + random(h - top - 2);
        topology.bridges = Array.from({ length: bottom - top - 1 }, (_, i) => ({
            x: column, y: top + i + 1, over: 'horizontal' as const,
        }));
        const graph = topologyGraph(w, h, topology);
        const row = (y: number, from = 0, to = w) => Array.from({ length: to - from }, (_, i) => y * w + from + i);
        const paths: number[][] = [];
        for (let y = 0; y < h; y++) {
            if (y === top) paths.push(row(y, column + 1));
            else if (y === bottom) paths.push(row(y, 0, column));
            else {
                let path = row(y);
                if (y === top + 1) path = [...row(top, 0, column).reverse(), ...path];
                if (y === bottom - 1) path = [...path, ...row(bottom, column + 1).reverse()];
                paths.push(path);
            }
        }
        paths.push(Array.from({ length: bottom - top + 1 }, (_, i) =>
            i === 0 || i === bottom - top ? (top + i) * w + column : w * h + i - 1));

        const owner = new Int16Array(graph.nodes.length);
        paths.forEach((path, color) => path.forEach(id => { owner[id] = color; }));
        for (let attempt = 0; attempt < graph.nodes.length * 400; attempt++) {
            const color = random(paths.length), path = paths[color], front = random(2) === 0;
            const end = front ? path[0] : path.at(-1)!;
            const adjacent = graph.edges[end], id = adjacent[random(adjacent.length)];
            const donorColor = owner[id], donor = paths[donorColor];
            if (donorColor === color || donor.length <= 3 || graph.nodes[id].lane !== 'cell') continue;
            const donorFront = donor[0] === id;
            if (!donorFront && donor.at(-1) !== id) continue;
            // An endpoint may never stop on one of the crossing's lanes.
            const next = donorFront ? donor[1] : donor[donor.length - 2];
            if (graph.nodes[next].lane !== 'cell' || graph.edges[id].filter(n => owner[n] === color).length !== 1) continue;
            if (donorFront) donor.shift(); else donor.pop();
            if (front) path.unshift(id); else path.push(id);
            owner[id] = color;
        }
        const colors = COLOR_PLACEMENT_ORDER.slice(0, paths.length);
        for (let i = colors.length - 1; i > 0; i--) {
            const j = random(i + 1);
            [colors[i], colors[j]] = [colors[j], colors[i]];
        }
        pathSolution = { version: 1, paths: paths.map((path, i) => ({ color: colors[i], nodes: path.map(id => {
            const node = graph.nodes[id];
            return transpose ? { x: node.y, y: node.x, lane: node.lane === 'cell' ? 'cell' : node.lane === 'horizontal' ? 'vertical' : 'horizontal' } : { ...node };
        }) })) };
        if (transpose) topology.bridges = topology.bridges.map(({ x, y }) => ({ x: y, y: x, over: 'horizontal' }));
        board = endpoints(width, height, pathSolution);
    }
    topology = normalizeTopology(topology, board, mode);
    validateSolution(board, topology, pathSolution);
    return { width, height, mode, seed, board, topology, pathSolution,
        solution: solutionBoard(board, pathSolution), pairCount: pathSolution.paths.length };
}

function endpoints(width: number, height: number, solution: PuzzleSolution): number[][] {
    const board = Array.from({ length: width }, () => Array<number>(height).fill(0));
    for (const path of solution.paths) for (const node of [path.nodes[0], path.nodes.at(-1)!]) board[node.x][node.y] = path.color;
    return board;
}
