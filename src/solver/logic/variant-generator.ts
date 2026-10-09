import type { GameMode } from './game-modes';
import { generateBridgeCover } from './bridge-generator';
import { generateWarpCover } from './warp-generator';
import { createPuzzleRandom, generateRectangularPuzzle, validateGeneratorInputs, type GeneratedPuzzle } from './puzzle-generator';
import { boardToSolution, solutionBoard, validateInducedSolution, type PuzzleSolution } from './solution';
import { normalizeTopology, type PuzzleTopology } from './topology';

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

    if (mode === 'standard') {
        const puzzle = generateRectangularPuzzle(width, height, seed);
        pathSolution = boardToSolution(puzzle.board, puzzle.solution, topology);
        board = endpoints(width, height, pathSolution);
    } else {
        ({ topology, pathSolution } = mode === 'bridges'
            ? generateBridgeCover(width, height, random) : generateWarpCover(width, height, random));
        board = endpoints(width, height, pathSolution);
    }
    topology = normalizeTopology(topology, board, mode);
    validateInducedSolution(board, topology, pathSolution);
    return { width, height, mode, seed, board, topology, pathSolution,
        solution: solutionBoard(board, pathSolution), pairCount: pathSolution.paths.length };
}

function endpoints(width: number, height: number, solution: PuzzleSolution): number[][] {
    const board = Array.from({ length: width }, () => Array<number>(height).fill(0));
    for (const path of solution.paths) for (const node of [path.nodes[0], path.nodes.at(-1)!]) board[node.x][node.y] = path.color;
    return board;
}
