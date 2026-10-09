import type { GameMode } from './game-modes';
import { generateBridgeCover } from './bridge-generator';
import { createPuzzleRandom, generateRectangularPuzzle, validateGeneratorInputs, type GeneratedPuzzle } from './puzzle-generator';
import { boardToSolution, solutionBoard, validateSolution, type PuzzleSolution } from './solution';
import { normalizeTopology, seamKey, type PuzzleTopology } from './topology';

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
        ({ topology, pathSolution } = generateBridgeCover(width, height, random));
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
