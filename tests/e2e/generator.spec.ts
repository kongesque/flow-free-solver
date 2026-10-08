import { openBoardOptions } from './board-options';
import { test, expect, type Page } from '@playwright/test';
import { assertSolution } from '../fixtures/assert-solution.mjs';

const colors = ' RBYGOCMmPAWgTbcp';

async function readGrid(page: Page, size: number) {
    const labels = await page.getByRole('article', { name: 'Puzzle Grid Board' }).getByRole('button')
        .evaluateAll(cells => cells.map(cell => cell.getAttribute('aria-label')!));
    return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) =>
        Number(labels[y * size + x].split('Color ')[1]) || 0));
}

function puzzleText(rows: number[][]) {
    return rows.map(row => row.map(color => color ? colors[color] : '.').join('')).join('\n');
}

function validateSolution(input: number[][], solution: number[][]) {
    assertSolution(puzzleText(input), solution.map(row => row.map(color => colors.charCodeAt(color))));
}

async function generate(page: Page, size: number) {
    if (await page.getByRole('combobox', { name: 'Grid Size' }).inputValue() !== String(size) && await page.locator('.endpoint-dot').count()) {
        page.once('dialog', dialog => dialog.accept());
    }
    await page.getByRole('combobox', { name: 'Grid Size' }).selectOption(String(size));
    if (await page.locator('.endpoint-dot').count() && await page.getByRole('button', { name: 'Edit', exact: true }).count() === 0) {
        page.once('dialog', dialog => dialog.accept());
    }
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(`Generated · ${size} pairs`);
    const board = await readGrid(page, size);
    expect(board.flat().filter(Boolean)).toHaveLength(size * 2);
    for (let color = 1; color <= size; color++) {
        expect(board.flat().filter(c => c === color)).toHaveLength(2);
    }
    return board;
}

async function solve(page: Page) {
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled({ timeout: 45_000 });
    await expect(page.getByRole('status')).toContainText('Solved');
}

test('generates, independently solves, and edits every supported grid size in real workers', async ({ page }) => {
    // Reproduce a known corpus seed; random layouts can exceed C's search budget.
    // Other browser cases use real randomness, and unit cases cover 330 layouts.
    await page.addInitScript(() => {
        Object.defineProperty(crypto, 'getRandomValues', {
            value: (array: Uint32Array) => { array[0] = 42; return array; },
        });
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let workers = 0;
    page.on('worker', () => { workers++; });
    await page.goto('./');
    for (let size = 5; size <= 15; size++) {
        const input = await generate(page, size);
        await solve(page);
        await expect(page.getByRole('status')).toContainText('Solved');
        validateSolution(input, await readGrid(page, size));
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        await solve(page);
        await expect(page.getByRole('status')).toContainText('Solved');
        validateSolution(input, await readGrid(page, size));
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        expect(await readGrid(page, size)).toEqual(input);
    }
    expect(workers).toBe(33);
    expect(errors).toEqual([]);
});

for (const algorithm of ['heuristic_bfs', 'astar', 'z3']) {
    test(`generated puzzle can be independently solved by ${algorithm} in a real worker`, async ({ page }) => {
        await page.goto('./');
        const input = await generate(page, 5);
        await openBoardOptions(page);
        await page.getByRole('combobox', { name: 'Solver Algorithm' }).selectOption(algorithm);
        await solve(page);
        await expect(page.getByRole('status')).toContainText('Solved', { timeout: 45_000 });
        validateSolution(input, await readGrid(page, 5));
        // Generate again from the solved view without requiring a manual reset.
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Generated');
        await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeVisible();
        expect((await readGrid(page, 5)).flat().filter(Boolean)).toHaveLength(10);
    });
}

test('generated endpoints and solution survive reload; editing invalidates the saved solution', async ({ page }) => {
    await page.goto('./');
    const input = await generate(page, 8);
    await expect.poll(() => page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = indexedDB.open('flow-solver-db');
            request.onsuccess = () => resolve(request.result);
        });
        const state = await new Promise<{ generatedSolution?: number[][] }>(resolve => {
            const request = db.transaction('puzzle-state').objectStore('puzzle-state').get('current');
            request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return state?.generatedSolution?.length;
    })).toBe(8);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeVisible();
    expect(await readGrid(page, 8)).toEqual(input);
    await solve(page);
    validateSolution(input, await readGrid(page, 8));
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: /Cell .* Color/ }).first().click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('End');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(64);
});

test('primary Cancel stops generation without moving the action or changing endpoints', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/generator\.worker/, async route => {
        await gate;
        await route.continue().catch(() => {});
    });
    try {
        await page.goto('./');
        await page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true }).click();
        await page.getByRole('button', { name: 'Cell 4,0 Empty', exact: true }).click();
        const action = page.locator('.primary-action');
        const originalBounds = await action.boundingBox();
        page.once('dialog', dialog => dialog.accept());
        const request = page.waitForRequest(/generator\.worker/);
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        await request;
        const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
        await expect(cancel).toBeEnabled();
        expect(await cancel.boundingBox()).toEqual(originalBounds);
        await cancel.click();
        await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeEnabled();
        expect(await action.boundingBox()).toEqual(originalBounds);
        await expect(page.getByRole('button', { name: /Cell .* Color 1$/ })).toHaveCount(2);
        release();
        await page.unroute(/generator\.worker/);
        const input = await generate(page, 5);
        await solve(page);
        validateSolution(input, await readGrid(page, 5));
    } finally { release(); }
});

test('Reset cancels generation and a fresh generation succeeds', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/generator\.worker/, async route => {
        await gate;
        await route.continue().catch(() => {});
    });
    try {
        await page.goto('./');
        const request = page.waitForRequest(/generator\.worker/);
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        await request;
        await expect(page.getByRole('status')).toContainText('Generating');
        await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
        await expect(page.getByRole('combobox', { name: 'Grid Size' })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true })).toBeDisabled();
        page.once('dialog', dialog => dialog.dismiss());
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Generating');
        await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled();
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        release();
        await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled();
        await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(25);
        const input = await generate(page, 5);
        await solve(page);
        validateSolution(input, await readGrid(page, 5));
    } finally {
        release();
    }
});

test('failed generator worker preserves the board and allows retry', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true }).click();
    await page.route(/generator\.worker/, route => route.abort());
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Could not generate puzzle');
    await expect(page.getByRole('button', { name: 'Cell 0,0 Color 1', exact: true })).toBeVisible();
    await page.unroute(/generator\.worker/);
    await generate(page, 5);
});

test('retains a valid generated solution when independent search reaches its limit', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(crypto, 'getRandomValues', {
            value: (array: Uint32Array) => { array[0] = 25; return array; },
        });
    });
    await page.goto('./');
    const input = await generate(page, 13);
    await solve(page);
    await expect(page.getByRole('status')).not.toContainText('ms');
    await expect(page.getByRole('status')).toContainText('Solved');
    validateSolution(input, await readGrid(page, 13));
});

test('generation controls fit on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    const input = await generate(page, 15);
    await solve(page);
    validateSolution(input, await readGrid(page, 15));
    for (const name of ['Generate', 'Edit', 'Reset']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeInViewport();
    }
    await page.screenshot({ path: test.info().outputPath('generated-mobile.png') });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    for (const source of ['manual', 'edited generated']) {
        test(`Generate protects ${source} endpoints at ${viewport.width}px`, async ({ page }) => {
            await page.setViewportSize(viewport);
            let workers = 0;
            page.on('worker', () => { workers++; });
            await page.goto('./');
            let missingCell = 'Cell 4,0 Empty';
            if (source === 'manual') {
                await page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true }).click();
            } else {
                await generate(page, 5);
                const endpoint = page.getByRole('button', { name: /Cell .* Color/ }).first();
                missingCell = (await endpoint.getAttribute('aria-label'))!.replace(/Color \d+/, 'Empty');
                await endpoint.click();
            }
            const endpoints = await readGrid(page, 5);
            const previousWorkers = workers;
            await expect(page.getByRole('status')).toContainText('End');
            let message = '';
            page.once('dialog', dialog => {
                message = dialog.message();
                return dialog.dismiss();
            });
            await page.getByRole('button', { name: 'Generate', exact: true }).click();
            expect(message).toBe('Replace your endpoints with a generated puzzle?');
            expect(await readGrid(page, 5)).toEqual(endpoints);
            expect(workers).toBe(previousWorkers);
            await expect(page.getByRole('status')).toContainText('End');
            // Cancel also preserves the pending color, so the next tap completes its pair.
            const pendingColor = endpoints.flat().find(color => color !== 0 && endpoints.flat().filter(c => c === color).length === 1)!;
            await page.getByRole('button', { name: missingCell, exact: true }).click();
            expect((await readGrid(page, 5)).flat().filter(color => color === pendingColor)).toHaveLength(2);
            page.once('dialog', dialog => dialog.accept());
            await page.getByRole('button', { name: 'Generate', exact: true }).click();
            await expect(page.getByRole('status')).toContainText('Generated · 5 pairs');
            expect(workers).toBe(previousWorkers + 1);
            const generated = await readGrid(page, 5);
            await solve(page);
            validateSolution(generated, await readGrid(page, 5));
        });
    }
}
