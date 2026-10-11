import { expect, test } from '@playwright/test';
import { generateModePuzzle } from '../../src/solver/logic/variant-generator';
import { bridgesSafariScreenshot } from '../fixtures/bridges-safari-screenshot.mjs';
import { assertTopologySolution } from '../fixtures/assert-topology-solution.mjs';
import { maskedWarpLimit } from '../fixtures/masked-warp-limit.mjs';
import { solverWorkerUrl } from './z3-test-worker';
import { openBoardOptions } from './board-options';
import { GENERATOR_WORKER_REQUEST } from './worker-requests';
import type { PuzzleSolution } from '../../src/solver/logic/solution';

test('19x19 graph probes and bounded fallback do not overflow the Wasm call stack', async ({ page }) => {
    const url = await solverWorkerUrl(page);
    for (const fixture of [bridgesSafariScreenshot(),
        ...(['bridges', 'warps'] as const).map(mode => ({ ...generateModePuzzle(19, 19, mode, 42), mode, input: '' })),
        maskedWarpLimit()]) {
        const result = await page.evaluate(({ url, fixture }) => new Promise<{
            status: string; error?: string; solution: PuzzleSolution | null; fallbackUsed: boolean;
        }>((resolve, reject) => {
            const worker = new Worker(url, { type: 'module' });
            worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
            worker.onmessage = ({ data }) => { worker.terminate(); resolve(data); };
            worker.postMessage({ board: fixture.board, ...fixture.topology, mode: fixture.mode,
                type: 'heuristic_bfs', allowFallback: false });
        }), { url, fixture });
        expect(result.status, result.error).toBe(fixture.topology.blocks?.length ? 'limit' : 'solved');
        expect(result.fallbackUsed).toBe(false);
        if (result.solution) assertTopologySolution(fixture, result.solution);
        else expect(result.status).toBe('limit');
    }
});

test('19x19 Bridges screenshot solves in the editor and preserves its dots and crossings', async ({ page }) => {
    const original = bridgesSafariScreenshot(), order = [1, 4, 2, 3, 5, 6, 7, 8, 9, 11, 10, 12, 13, 14];
    const fixture = { ...original, board: original.board.map(col => col.map(color => color ? order[color - 1] : 0)) };
    await page.goto('./'); await openBoardOptions(page);
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('bridges');
    await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('19');
    for (const color of order) for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) {
        if (fixture.board[x][y] === color) await page.locator(`[data-cell="${x},${y}"]`).click();
    }
    await page.getByRole('button', { name: 'Bridges', exact: true }).click();
    for (const { x, y } of fixture.topology.bridges) await page.locator(`[data-cell="${x},${y}"]`).click();
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solved');
    assertTopologySolution(fixture, JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!));
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('.endpoint-dot')).toHaveCount(28);
    await expect(page.locator('[data-bridge]')).toHaveCount(3);
});

test('a stale generator worker explains reload recovery and preserves the 19x19 puzzle', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('19');
    await page.locator('[data-cell="0,0"]').click();
    await page.route(GENERATOR_WORKER_REQUEST, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html>App updated</html>' }));
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Reload the page');
    await expect(page.getByRole('button', { name: 'Cell 0,0 Color 1', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('flow-solver-db'); r.onsuccess = () => resolve(r.result); });
        const saved = await new Promise<any>(resolve => { const r = db.transaction('puzzle-state').objectStore('puzzle-state').get('current'); r.onsuccess = () => resolve(r.result); });
        db.close(); return saved?.board[0][0];
    })).toBe(1);
    await page.unroute(GENERATOR_WORKER_REQUEST); await page.reload();
    await expect(page.getByRole('button', { name: 'Cell 0,0 Color 1', exact: true })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).not.toContainText('Could not generate');
    await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeEnabled();
    const labels = await page.locator('[data-cell]').evaluateAll(cells => cells.map(cell => cell.getAttribute('aria-label')!));
    const board = Array.from({ length: 19 }, (_, x) => Array.from({ length: 19 }, (_, y) => Number(labels[y * 19 + x].split('Color ')[1]) || 0));
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solved');
    assertTopologySolution({ width: 19, height: 19, input: '', mode: 'standard', board,
        topology: { walls: [], blocks: [], bridges: [], warps: [] } },
        JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!));
});
