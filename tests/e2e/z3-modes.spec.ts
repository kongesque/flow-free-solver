import { expect, test } from '@playwright/test';
import { generateModePuzzle } from '../../src/solver/logic/variant-generator';
import { assertTopologySolution } from '../fixtures/assert-topology-solution.mjs';
import { bridgeCross, largeBridgeCover, warpRows, warpSnake } from '../fixtures/topology-puzzles.mjs';
import { wallCorridor } from '../fixtures/wall-puzzles.mjs';
import { solveSat, solverWorkerUrl } from './z3-test-worker';

const chars = '.RBYGOCMmPAWgTbcp';
const boardFromText = (input: string) => {
    const rows = input.trim().split('\n');
    return Array.from({ length: rows[0].length }, (_, x) => rows.map(row => chars.indexOf(row[x])));
};

for (let size = 5; size <= 19; size++) {
    test(`Z3 verifies generated covers in all modes on square and rectangular shapes at width ${size}`, async ({ page }) => {
        test.setTimeout(180_000);
        const url = await solverWorkerUrl(page);
        const dimensions = Array.from({ length: 15 }, (_, index) => [size, index + 5]);
        for (const [width, height] of dimensions) {
            for (const mode of ['standard', 'bridges', 'warps'] as const) {
                const puzzle = generateModePuzzle(width, height, mode, 42);
                const result = await solveSat(page, url, puzzle.board, puzzle.topology, mode, puzzle.pathSolution);
                expect(result.status, `${mode} ${width}x${height}: ${result.error ?? result.status}`).toBe('solved');
                assertTopologySolution({ ...puzzle, mode, input: '' }, result.solution!);
            }
            const walls = wallCorridor(width, height);
            const puzzle = { width, height, board: boardFromText(walls.input), input: walls.input,
                topology: { walls: walls.walls, bridges: [], warps: [] }, mode: 'standard' as const };
            const result = await solveSat(page, url, puzzle.board, puzzle.topology, puzzle.mode);
            expect(result.status).toBe('solved'); assertTopologySolution(puzzle, result.solution!);
        }
    });
}

test('Z3 independently solves uncached generated variant puzzles', async ({ page }) => {
    const url = await solverWorkerUrl(page);
    for (const mode of ['bridges', 'warps'] as const) for (const [width, height] of [[5, 5], [5, 8], [8, 5], [8, 8]]) {
        const puzzle = generateModePuzzle(width, height, mode, 42);
        const result = await solveSat(page, url, puzzle.board, puzzle.topology, mode);
        expect(result.status, `${mode} ${width}x${height}: ${result.error ?? result.status}`).toBe('solved');
        assertTopologySolution({ ...puzzle, mode, input: '' }, result.solution!);
    }
});

test('Z3 rejects an invalid generated certificate instead of accepting its display board', async ({ page }) => {
    const url = await solverWorkerUrl(page);
    for (const mode of ['standard', 'bridges', 'warps'] as const) {
        const puzzle = generateModePuzzle(5, 8, mode, 42);
        const candidate = structuredClone(puzzle.pathSolution);
        candidate.paths[0].nodes.splice(1, 0, candidate.paths[0].nodes[0]);
        const result = await solveSat(page, url, puzzle.board, puzzle.topology, mode, candidate);
        expect(result.status).toBe('error'); expect(result.board).toBeNull(); expect(result.solution).toBeNull();
        expect(result.error).toContain('Overlapping or invalid path node');
    }
});

test('Z3 respects adjacent crossing lanes, forced seams, and closed-seam unsatisfiability', async ({ page }) => {
    const url = await solverWorkerUrl(page);
    for (const puzzle of [bridgeCross(), bridgeCross(true), largeBridgeCover(18), warpRows(5, 8), warpRows(5, 8, true), warpSnake(18)]) {
        assertTopologySolution(puzzle, puzzle.solution);
        const result = await solveSat(page, url, puzzle.board, puzzle.topology, puzzle.mode);
        expect(result.status, `${puzzle.mode} ${puzzle.width}x${puzzle.height}, ${puzzle.topology.bridges.length} bridges: ${result.error ?? result.status}`).toBe('solved'); assertTopologySolution(puzzle, result.solution!);
    }
    const puzzle = warpRows();
    const result = await solveSat(page, url, puzzle.board, { ...puzzle.topology, warps: [] }, 'warps');
    expect(result.status).toBe('unsatisfiable'); expect(result.error).toBeUndefined();
});
