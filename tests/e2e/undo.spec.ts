import { expect, test, type Page } from '@playwright/test';
import { openBoardOptions, selectWallTool } from './board-options';

const undo = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true });
const cell = (page: Page, x: number, y: number) => page.getByRole('button', { name: new RegExp(`^Cell ${x},${y} `) });
const labels = (page: Page) => page.locator('.puzzle-grid button').evaluateAll(cells => cells.map(cell => cell.getAttribute('aria-label')));

async function saved(page: Page) {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = indexedDB.open('flow-solver-db');
            request.onsuccess = () => resolve(request.result);
        });
        const state = await new Promise<{ board: number[][]; walls: unknown[]; generatedSolution: number[][] | null } | undefined>(resolve => {
            const request = db.transaction('puzzle-state').objectStore('puzzle-state').get('current');
            request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return state;
    });
}

for (const width of [390, 1280]) {
    test(`universal Undo reverses mixed endpoint and wall edits in order at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('./');
        await expect(undo(page)).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Undo wall', exact: true })).toHaveCount(0);
        await cell(page, 0, 0).click();
        await cell(page, 4, 0).click();
        await cell(page, 0, 1).click();
        await expect(cell(page, 0, 1)).toHaveAttribute('aria-label', 'Cell 0,1 Color 2');
        await selectWallTool(page);
        await cell(page, 0, 0).focus();
        await page.keyboard.press('Shift+ArrowRight');
        await page.getByRole('button', { name: 'Clear walls', exact: true }).click();
        await expect(page.locator('[data-wall]')).toHaveCount(0);
        await page.locator('.board-options summary').click();

        await undo(page).click(); // Clear walls.
        await expect(page.locator('[data-wall]')).toHaveCount(1);
        await undo(page).click(); // Wall stroke.
        await expect(page.locator('[data-wall]')).toHaveCount(0);
        await expect(cell(page, 0, 1)).toHaveAttribute('aria-label', 'Cell 0,1 Color 2');
        await cell(page, 0, 0).focus();
        await page.keyboard.press('Control+z'); // First blue endpoint.
        await expect(cell(page, 0, 1)).toHaveAttribute('aria-label', 'Cell 0,1 Empty');
        await page.keyboard.press('Meta+z'); // Second red endpoint.
        await expect(cell(page, 4, 0)).toHaveAttribute('aria-label', 'Cell 4,0 Empty');
        await openBoardOptions(page);
        await page.getByRole('button', { name: 'Dots', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('End');
        await cell(page, 4, 1).click(); // The restored pending color is red.
        await expect(cell(page, 4, 1)).toHaveAttribute('aria-label', 'Cell 4,1 Color 1');
        await undo(page).click();
        await undo(page).click();
        await expect(page.getByRole('button', { name: /Cell .* Empty$/ })).toHaveCount(25);
        await expect(undo(page)).toBeDisabled();
        await expect.poll(async () => {
            const state = await saved(page);
            return state && [state.board.flat().filter(Boolean).length, state.walls.length];
        }).toEqual([0, 0]);
        await page.reload();
        await expect(undo(page)).toBeDisabled();
        await expect(page.getByRole('button', { name: /Cell .* Empty$/ })).toHaveCount(25);
    });
}

test('Undo restores removed endpoints and leaves form shortcuts alone; Reset and resize start fresh histories', async ({ page }) => {
    await page.goto('./');
    await cell(page, 0, 0).click();
    await cell(page, 4, 0).click();
    await cell(page, 0, 0).click();
    await undo(page).click();
    await expect(page.getByRole('button', { name: /Cell .* Color 1$/ })).toHaveCount(2);
    const before = await labels(page);
    await openBoardOptions(page);
    await page.getByRole('combobox', { name: 'Grid Width' }).focus();
    await page.keyboard.press('Control+z');
    expect(await labels(page)).toEqual(before);
    await cell(page, 0, 0).focus();
    await page.keyboard.press('Control+Shift+z');
    expect(await labels(page)).toEqual(before);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(undo(page)).toBeDisabled();
    await cell(page, 1, 1).click();
    await expect(undo(page)).toBeEnabled();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('6');
    await expect(undo(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: /Cell .* Empty$/ })).toHaveCount(36);
});

test('generation starts a fresh history; Undo does not revive a discarded generated solution', async ({ page }) => {
    await page.goto('./');
    await cell(page, 0, 0).click();
    await expect(undo(page)).toBeEnabled();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Generated');
    await expect(undo(page)).toBeDisabled();
    const original = await labels(page);
    await page.getByRole('button', { name: /Cell .* Color/ }).first().click();
    await undo(page).click();
    expect(await labels(page)).toEqual(original);
    await expect(page.getByRole('status')).not.toContainText('Generated');
    await expect.poll(async () => (await saved(page))?.generatedSolution).toBeNull();
});
