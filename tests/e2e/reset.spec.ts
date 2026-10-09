import { optIntoGenerator } from './board-options';
import { selectWallTool } from './board-options';
import { test, expect, type Page } from '@playwright/test';

const resetMessage = 'Reset this puzzle? This will clear all endpoints, walls, blocks, bridges, warps, and saved solutions.';
const reset = (page: Page) => page.getByRole('button', { name: 'Reset', exact: true });
const labels = (page: Page) => page.locator('.puzzle-grid button').evaluateAll(cells =>
    cells.map(cell => cell.getAttribute('aria-label')));

async function saved(page: Page) {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = indexedDB.open('flow-solver-db');
            request.onsuccess = () => resolve(request.result);
        });
        const state = await new Promise<{
            board: number[][]; walls: unknown[]; generatedSolution: number[][] | null; activeColor: number;
        } | undefined>(resolve => {
            const request = db.transaction('puzzle-state').objectStore('puzzle-state').get('current');
            request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return state;
    });
}

test('Reset does not warn for an empty idle board', async ({ page }) => {
    await page.goto('./');
    await expect(reset(page)).toBeEnabled();
    let dialogs = 0;
    page.on('dialog', dialog => { dialogs++; return dialog.dismiss(); });
    await reset(page).click();
    expect(dialogs).toBe(0);
    await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(25);
});

for (const width of [390, 1280]) {
    test(`Reset Cancel preserves endpoints, walls, undo and saved work at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('./');
        await page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true }).click();
        await selectWallTool(page);
        await page.getByRole('button', { name: 'Cell 1,1 Empty', exact: true }).focus();
        await page.keyboard.press('Shift+ArrowRight');
        await expect.poll(async () => (await saved(page))?.walls.length).toBe(1);
        const previousLabels = await labels(page);
        const previousSave = await saved(page);
        let message = '';
        page.once('dialog', dialog => { message = dialog.message(); return dialog.dismiss(); });
        await reset(page).click();
        expect(message).toBe(resetMessage);
        expect(await labels(page)).toEqual(previousLabels);
        expect(await saved(page)).toEqual(previousSave);
        await expect(page.locator('[data-wall="1,1,right"]')).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();

        // Cancel preserves the pending endpoint color, and reload preserves the puzzle.
        await page.getByRole('button', { name: 'Dots', exact: true }).click();
        await page.getByRole('button', { name: 'Cell 4,0 Empty', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Cell 4,0 Color 1', exact: true })).toBeVisible();
        await expect.poll(async () => (await saved(page))?.board[4][0]).toBe(1);
        await page.reload();
        await expect(page.locator('[data-wall]')).toHaveCount(1);
        await expect(page.getByRole('button', { name: /Cell .* Color 1$/ })).toHaveCount(2);

        page.once('dialog', dialog => dialog.accept());
        await reset(page).click();
        await expect(page.locator('[data-wall]')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(25);
        await expect.poll(async () => {
            const state = await saved(page);
            return state && { endpoints: state.board.flat().filter(Boolean).length,
                walls: state.walls.length, solution: state.generatedSolution, color: state.activeColor };
        }).toEqual({ endpoints: 0, walls: 0, solution: null, color: 1 });
    });
}

test('Reset Cancel preserves a solved generated puzzle; confirmation clears its saved solution', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(crypto, 'getRandomValues', {
            value: (array: Uint32Array) => { array[0] = 42; return array; },
        });
    });
    await page.goto('./');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Generated');
    await expect.poll(async () => (await saved(page))?.generatedSolution?.length).toBe(5);
    const previousSave = await saved(page);
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solved');
    const solutionLabels = await labels(page);
    page.once('dialog', dialog => dialog.dismiss());
    await reset(page).click();
    await expect(page.getByRole('status')).toContainText('Solved');
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
    expect(await labels(page)).toEqual(solutionLabels);
    expect(await saved(page)).toEqual(previousSave);
    page.once('dialog', dialog => dialog.accept());
    await reset(page).click();
    await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(25);
    await expect.poll(async () => (await saved(page))?.generatedSolution).toBeNull();
    await page.reload();
    await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(25);
    await expect(page.getByRole('status')).not.toContainText('Generated');
});

test.beforeEach(async ({ page }) => { await optIntoGenerator(page); });
