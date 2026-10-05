import { test, expect, type Page } from '@playwright/test';
import { assertSolution } from '../fixtures/assert-solution.mjs';

const colors = '.RBYGOCMmPAWgTbcp';

async function dimensions(page: Page, width: number, height: number) {
    await page.getByRole('combobox', { name: 'Grid Width' }).selectOption(String(width));
    await page.getByRole('combobox', { name: 'Grid Height' }).selectOption(String(height));
    await expect(page.getByRole('article', { name: 'Puzzle Grid Board' }).getByRole('button')).toHaveCount(width * height);
}

async function rows(page: Page, width: number, height: number) {
    const values = await page.getByRole('article', { name: 'Puzzle Grid Board' }).getByRole('button')
        .evaluateAll(cells => cells.map(cell => Number(cell.getAttribute('aria-label')!.split('Color ')[1]) || 0));
    return Array.from({ length: height }, (_, y) => values.slice(y * width, (y + 1) * width));
}

function validate(input: number[][], solution: number[][]) {
    assertSolution(input.map(row => row.map(color => colors[color]).join('')).join('\n'),
        solution.map(row => row.map(color => color ? colors.charCodeAt(color) : 0)));
}

async function savedState(page: Page) {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = indexedDB.open('flow-solver-db');
            request.onsuccess = () => resolve(request.result);
        });
        const state = await new Promise<{ width?: number; height?: number; mode?: string; generatedSolution?: number[][] }>(resolve => {
            const request = db.transaction('puzzle-state').objectStore('puzzle-state').get('current');
            request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return state;
    });
}

for (const [width, height] of [[5, 8], [8, 5], [7, 10], [10, 7]]) {
    test(`generates and independently solves ${width}x${height} using real C/Wasm workers`, async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(crypto, 'getRandomValues', {
                value: (array: Uint32Array) => { array[0] = 42; return array; },
            });
        });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('./');
        await page.getByRole('combobox', { name: 'Solver Algorithm' }).selectOption('astar');
        await dimensions(page, width, height);
        await expect(page.getByRole('combobox', { name: 'Solver Algorithm' })).toHaveValue('heuristic_bfs');
        await expect(page.getByRole('combobox', { name: 'Solver Algorithm' })).toBeDisabled();
        const grid = page.getByRole('article', { name: 'Puzzle Grid Board' });
        const bounds = await grid.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.width / bounds!.height).toBeCloseTo(width / height, 1);
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Generated solvable puzzle');
        const input = await rows(page, width, height);
        await page.getByRole('button', { name: 'Show solution' }).click();
        validate(input, await rows(page, width, height));
        await page.getByRole('button', { name: 'Hide solution' }).click();
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved');
        validate(input, await rows(page, width, height));
        expect(errors).toEqual([]);
    });
}

for (const [width, height] of [[5, 15], [15, 5]]) {
    test(`edits and solves boundary ${width}x${height}, then resets`, async ({ page }) => {
        await page.goto('./');
        await dimensions(page, width, height);
        // One induced horizontal path per row, using even the final row/column.
        for (let y = 0; y < height; y++) {
            await page.getByRole('button', { name: `Cell 0,${y} Empty`, exact: true }).click();
            await page.getByRole('button', { name: `Cell ${width - 1},${y} Empty`, exact: true }).click();
        }
        const input = await rows(page, width, height);
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved');
        validate(input, await rows(page, width, height));
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(width * height);
        await expect(page.getByRole('combobox', { name: 'Grid Width' })).toHaveValue(String(width));
        await expect(page.getByRole('combobox', { name: 'Grid Height' })).toHaveValue(String(height));
    });
}

test('rectangular dimensions and generated solution survive reload; square preset restores square controls', async ({ page }) => {
    await page.goto('./');
    await dimensions(page, 5, 8);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Generated solvable puzzle');
    const input = await rows(page, 5, 8);
    await expect.poll(async () => (await savedState(page))?.generatedSolution?.[0].length).toBe(8);
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Grid Height' })).toHaveValue('8');
    expect(await rows(page, 5, 8)).toEqual(input);
    await page.getByRole('button', { name: 'Show solution' }).click();
    validate(input, await rows(page, 5, 8));
    await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('8');
    await expect(page.getByRole('combobox', { name: 'Grid Width' })).toHaveValue('8');
    await expect(page.getByRole('combobox', { name: 'Grid Height' })).toHaveValue('8');
    await expect(page.getByRole('combobox', { name: 'Solver Algorithm' })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(64);
});

test('legacy square saves load with independent dimensions', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeEnabled();
    await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = indexedDB.open('flow-solver-db');
            request.onsuccess = () => resolve(request.result);
        });
        const board = Array.from({ length: 6 }, () => Array(6).fill(0));
        board[0][0] = board[5][0] = 1;
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('puzzle-state', 'readwrite');
            tx.objectStore('puzzle-state').put({ size: 6, board, solverType: 'astar', activeColor: 2,
                isPlacingSecond: false, savedAt: Date.now() }, 'current');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    });
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Grid Width' })).toHaveValue('6');
    await expect(page.getByRole('combobox', { name: 'Grid Height' })).toHaveValue('6');
    await expect(page.getByRole('combobox', { name: 'Game Mode' })).toHaveValue('standard');
    await expect(page.getByRole('combobox', { name: 'Solver Algorithm' })).toHaveValue('astar');
    await expect(page.getByRole('button', { name: 'Cell 5,0 Color 1', exact: true })).toBeVisible();
});

test('future mode placeholders block puzzle actions, persist, and return safely to Standard', async ({ page }) => {
    let workers = 0;
    page.on('worker', () => { workers++; });
    await page.goto('./');
    await dimensions(page, 5, 8);
    await page.getByRole('button', { name: 'Cell 4,7 Empty', exact: true }).click();
    for (const mode of ['bridges', 'hexes', 'warps']) {
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
        await expect(page.getByRole('status')).toContainText('coming soon');
        await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Cell 4,7 Color 1', exact: true })).toBeDisabled();
    }
    expect(workers).toBe(0);
    await expect.poll(async () => (await savedState(page))?.mode).toBe('warps');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Game Mode' })).toHaveValue('warps');
    await expect(page.getByRole('status')).toContainText('coming soon');
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('standard');
    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Cell 4,7 Color 1', exact: true })).toBeEnabled();
    await expect(page.getByRole('combobox', { name: 'Grid Height' })).toHaveValue('8');
});
