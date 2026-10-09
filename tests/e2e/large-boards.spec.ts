import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openBoardOptions, optIntoGenerator } from './board-options';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { assertTopologySolution } from '../fixtures/assert-topology-solution.mjs';
import { largeBridgeCover, warpSnake } from '../fixtures/topology-puzzles.mjs';
import { wallCorridor } from '../fixtures/wall-puzzles.mjs';
import type { PuzzleTopology } from '../../src/solver/logic/topology';
import type { PuzzleSolution } from '../../src/solver/logic/solution';
import type { PuzzleState } from '../../src/hooks/useStorage';

const chars = '.RBYGOCMmPAWgTbcp';
const order = [1, 4, 2, 3, 5, 6, 7, 8, 9, 11, 10, 12, 13, 14, 15, 16];
const classic = readFileSync(new URL('../fixtures/puzzles/nested_19x19.txt', import.meta.url), 'utf8');
const columnBoard = (input: string) => {
    const rows = input.trim().split('\n');
    return Array.from({ length: rows[0].length }, (_, x) => rows.map(row => chars.indexOf(row[x])));
};
const inputText = (board: number[][]) => Array.from({ length: board[0].length }, (_, y) =>
    board.map(column => chars[column[y]]).join('')).join('\n');

async function renderedRows(page: Page) {
    const colors = await page.locator('[data-cell]').evaluateAll(cells => cells.map(cell =>
        Number(cell.getAttribute('aria-label')?.split('Color ')[1]) || 0));
    return Array.from({ length: 19 }, (_, y) => colors.slice(y * 19, (y + 1) * 19).map(color => chars.charCodeAt(color)));
}

async function savedDraft(page: Page): Promise<PuzzleState> {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => {
            const r = indexedDB.open('flow-solver-db'); r.onsuccess = () => resolve(r.result);
        });
        const saved = await new Promise<PuzzleState>(resolve => {
            const r = db.transaction('puzzle-state').objectStore('puzzle-state').get('current'); r.onsuccess = () => resolve(r.result);
        });
        db.close(); return saved;
    });
}

async function loadDraft(page: Page, mode: string, board: number[][], topology: PuzzleTopology) {
    await page.goto('./');
    await expect(page.locator('[data-cell="0,0"]')).toBeEnabled();
    await page.evaluate(async ({ mode, board, topology }) => {
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = indexedDB.open('flow-solver-db'); request.onsuccess = () => resolve(request.result);
        });
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('puzzle-state', 'readwrite');
            tx.objectStore('puzzle-state').put({ schemaVersion: 2, width: 19, height: 19, mode, board, ...topology,
                solverType: 'heuristic_bfs', activeColor: 1, isPlacingSecond: false,
                generatedSolution: null, generatedPathSolution: null, savedAt: Date.now() }, 'current');
            tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
        });
        db.close();
    }, { mode, board, topology });
    await page.reload();
    await expect(page.locator('[data-cell]')).toHaveCount(361);
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`19x19 can be placed, saved and solved by a real worker at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('./'); await openBoardOptions(page);
        await page.getByRole('combobox', { name: 'Grid Width' }).selectOption('19');
        await page.getByRole('combobox', { name: 'Grid Height' }).selectOption('19');
        await page.getByRole('switch', { name: 'Color label', exact: true }).check();
        const board = columnBoard(classic).map(column => column.map(color => color ? order[color - 1] : 0));
        for (const color of order) for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) {
            if (board[x][y] === color) await page.locator(`[data-cell="${x},${y}"]`).click();
        }
        await expect(page.locator('.endpoint-dot')).toHaveCount(20);
        await expect.poll(async () => JSON.stringify((await savedDraft(page))?.board)).toBe(JSON.stringify(board));
        await page.reload(); await openBoardOptions(page);
        await expect(page.getByRole('combobox', { name: 'Grid Width' })).toHaveValue('19');
        await expect(page.getByRole('combobox', { name: 'Grid Height' })).toHaveValue('19');
        await page.getByRole('switch', { name: 'Board guides', exact: true }).check();
        await expect(page.locator('.board-columns')).toHaveText('ABCDEFGHIJKLMNOPQRS');
        await expect(page.locator('.board-rows')).toHaveText(Array.from({ length: 19 }, (_, i) => i + 1).join(''));
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved', { timeout: 20_000 });
        assertSolution(inputText(board), await renderedRows(page));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
    });
}

test('19x19 wall routes solve without a cached generated solution', async ({ page }) => {
    const fixture = wallCorridor(19, 19);
    await loadDraft(page, 'standard', columnBoard(fixture.input), { walls: fixture.walls, bridges: [], warps: [] });
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solved', { timeout: 20_000 });
    assertSolution(fixture.input, await renderedRows(page), fixture.walls);
});

for (const fixture of [warpSnake(), largeBridgeCover(19)]) {
    test(`19x19 ${fixture.mode} solves with real graph workers and all lanes validated`, async ({ page }) => {
        await loadDraft(page, fixture.mode, fixture.board, fixture.topology);
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved', { timeout: 20_000 });
        const result = JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!) as PuzzleSolution;
        assertTopologySolution(fixture, result);
    });
}

test('generation works at 19x19 in every mode with contiguous color labels', async ({ page }) => {
    await optIntoGenerator(page);
    await page.addInitScript(() => {
        Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array[0] = 42; return array; } });
    });
    await page.goto('./'); await openBoardOptions(page);
    await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('19');
    await page.getByRole('switch', { name: 'Color label', exact: true }).check();
    for (const mode of ['standard', 'bridges', 'warps'] as const) {
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Generated');
        const board = await page.locator('[data-cell]').evaluateAll(cells => {
            const values = cells.map(cell => Number(cell.getAttribute('aria-label')!.split('Color ')[1]) || 0);
            return Array.from({ length: 19 }, (_, x) => Array.from({ length: 19 }, (_, y) => values[y * 19 + x]));
        });
        const labels = [...new Set(await page.locator('.endpoint-dot').allTextContents())].sort();
        expect(labels.join('')).toBe('ABCDEFGHIJKLMNOP'.slice(0, labels.length));
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved', { timeout: 20_000 });
        const solution = JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!) as PuzzleSolution;
        const saved = await savedDraft(page);
        const topology = { walls: saved.walls!, bridges: saved.bridges!, warps: saved.warps! };
        if (mode === 'standard') assertSolution(inputText(board), await renderedRows(page));
        else assertTopologySolution({ width: 19, height: 19, board, mode, topology, input: '', solution }, solution);
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
    }
});
