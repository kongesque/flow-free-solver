import { expect, test } from '@playwright/test';
import { openBoardOptions } from './board-options';
import { solveSat, solverWorkerUrl } from './z3-test-worker';
import { assertTopologySolution } from '../fixtures/assert-topology-solution.mjs';
import { largeBridgeCover, warpRows, warpSnake } from '../fixtures/topology-puzzles.mjs';
import type { PuzzleState } from '../../src/hooks/useStorage';

async function savedPuzzle(page: import('@playwright/test').Page): Promise<PuzzleState> {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = indexedDB.open('flow-solver-db'); request.onsuccess = () => resolve(request.result);
        });
        const state = await new Promise<PuzzleState>(resolve => {
            const request = db.transaction('puzzle-state').objectStore('puzzle-state').get('current');
            request.onsuccess = () => resolve(request.result);
        });
        db.close(); return state;
    });
}

test('Z3 selection survives walls, rectangular resizing, mode changes and reload', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('./'); await openBoardOptions(page);
    const solver = page.getByRole('combobox', { name: 'Solver Algorithm' });
    await solver.selectOption('z3');
    await page.getByRole('combobox', { name: 'Grid Width' }).selectOption('7');
    await page.getByRole('combobox', { name: 'Grid Height' }).selectOption('10');
    await page.getByRole('button', { name: 'Walls', exact: true }).click();
    await page.locator('[data-cell="0,0"]').focus(); await page.keyboard.press('Shift+ArrowRight');
    await expect(page.locator('[data-wall]')).toHaveCount(1); await expect(solver).toHaveValue('z3');
    await expect.poll(async () => (await savedPuzzle(page))?.walls?.length).toBe(1);
    await page.reload(); await openBoardOptions(page); await expect(solver).toHaveValue('z3');
    for (const mode of ['bridges', 'warps', 'standard']) {
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
        await expect(solver).toHaveValue('z3');
        await expect(solver.locator('option[value="astar"]')).toHaveCount(0);
    }
    await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('5');
    await expect(solver).toHaveValue('z3');
    await expect(solver.locator('option[value="astar"]')).toHaveCount(1);
});

test('generated 17x17, 18x18 and 19x19 puzzles in every mode solve with actual Z3 verification', async ({ page }) => {
    test.setTimeout(120_000);
    page.on('dialog', dialog => dialog.accept());
    const requests: string[] = [], workers: string[] = [], errors: string[] = [];
    page.on('worker', worker => workers.push(worker.url()));
    page.on('request', request => requests.push(request.url())); page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array[0] = 42; return array; } });
    });
    await page.goto('./'); await openBoardOptions(page);
    await page.getByRole('switch', { name: 'Color label', exact: true }).check();
    await page.getByRole('combobox', { name: 'Solver Algorithm' }).selectOption('z3');
    for (const size of [17, 18, 19]) for (const mode of ['standard', 'bridges', 'warps'] as const) {
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
        await page.getByRole('combobox', { name: 'Grid Size' }).selectOption(String(size));
        await expect(page.getByRole('combobox', { name: 'Solver Algorithm' })).toHaveValue('z3');
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Generated');
        const cells = await page.locator('[data-cell]').evaluateAll(cells => cells.map(cell => Number(cell.getAttribute('aria-label')?.split('Color ')[1]) || 0));
        const board = Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => cells[y * size + x]));
        await expect.poll(async () => JSON.stringify((await savedPuzzle(page))?.board)).toBe(JSON.stringify(board));
        const saved = await savedPuzzle(page);
        const labels = [...new Set(await page.locator('.endpoint-dot').allTextContents())].sort();
        expect(labels.length).toBeLessThanOrEqual(16); expect(labels.join('')).toBe('ABCDEFGHIJKLMNOP'.slice(0, labels.length));
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved', { timeout: 45_000 });
        const solution = JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!);
        assertTopologySolution({ width: size, height: size, board, input: '', mode,
            topology: { walls: saved.walls ?? [], bridges: saved.bridges ?? [], warps: saved.warps ?? [] } }, solution);
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
    }
    expect(requests.some(url => url.includes('z3-built.wasm'))).toBe(true);
    expect(requests.some(url => url.includes('flow_solver_c.wasm'))).toBe(false);
    for (const name of ['generator', 'solver']) {
        const scripts = workers.filter(url => url.includes(`${name}.worker`));
        expect(scripts).toHaveLength(9);
        expect(new Set(scripts).size).toBe(9);
        for (const script of scripts) expect(new URL(script).searchParams.get('run')).toBeTruthy();
    }
    expect(errors).toEqual([]);
});

test('Z3 solves uncached dense bridges and both warp orientations at mobile boundaries', async ({ page }) => {
    const url = await solverWorkerUrl(page);
    for (const puzzle of [largeBridgeCover(18), warpSnake(18), warpRows(18, 5), warpRows(18, 5, true)]) {
        assertTopologySolution(puzzle, puzzle.solution);
        const result = await solveSat(page, url, puzzle.board, puzzle.topology, puzzle.mode);
        expect(result.status, result.error).toBe('solved'); assertTopologySolution(puzzle, result.solution!);
    }
});
