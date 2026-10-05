import { test, expect } from '@playwright/test';

for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 568, height: 320 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
]) {
    test(`editor fits ${viewport.width}×${viewport.height} with square and rectangular boards`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('./');
        await expect(page.locator('.control-actions button')).toHaveCount(3);
        await expect(page.getByRole('combobox')).toHaveCount(2);
        const initialBoard = await page.getByRole('article', { name: 'Puzzle Grid Board' }).boundingBox();
        const controls = await page.getByRole('region', { name: 'Game Controls' }).boundingBox();
        expect(controls!.y).toBeGreaterThanOrEqual(initialBoard!.y + initialBoard!.height);
        await page.locator('.board-options summary').click();
        await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeEnabled();
        for (const [width, height] of [[5, 5], [15, 15], [5, 15], [15, 5]]) {
            await page.getByRole('combobox', { name: 'Grid Width' }).selectOption(String(width));
            await page.getByRole('combobox', { name: 'Grid Height' }).selectOption(String(height));
            const grid = page.getByRole('article', { name: 'Puzzle Grid Board' });
            const bounds = await grid.boundingBox();
            expect(bounds!.x).toBeGreaterThanOrEqual(0);
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
            expect(bounds!.width / bounds!.height).toBeCloseTo(width / height, 1);
            const cell = await grid.getByRole('button').first().boundingBox();
            expect(Math.abs(cell!.width - cell!.height)).toBeLessThan(1);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        }
        for (const control of await page.locator('.game-controls button:visible, .game-controls select:visible').all()) {
            const bounds = await control.boundingBox();
            expect(bounds!.height).toBeGreaterThanOrEqual(44);
            expect(bounds!.x).toBeGreaterThanOrEqual(0);
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
        }
    });
}

test('keyboard editing uses a single grid tab stop and respects rectangular boundaries', async ({ page }) => {
    await page.goto('./');
    await page.locator('.board-options summary').click();
    await page.getByRole('combobox', { name: 'Grid Height' }).selectOption('8');
    const first = page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true });
    await first.focus();
    await first.press('Enter');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('button', { name: 'Cell 0,0 Color 1', exact: true })).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Cell 4,0 Color 1', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Home');
    await expect(page.getByRole('button', { name: 'Cell 0,1 Empty', exact: true })).toBeFocused();
    await expect(page.locator('.puzzle-grid button[tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: 'Grid Size' })).toBeFocused();
});


test('keeps the familiar automatic endpoint sequence and repairs removed pairs', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.board-options')).not.toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: 'Choose endpoint color' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
    const cell = (x: number, y: number, color = 'Empty') => page.getByRole('button', { name: `Cell ${x},${y} ${color}`, exact: true });
    await expect(page.getByRole('status')).toContainText('Start');
    await cell(0, 0).click();
    await expect(page.getByRole('status')).toContainText('End');
    await cell(4, 0).click();
    await expect(page.getByRole('status')).toContainText('Start');
    await cell(0, 1).click();
    await cell(4, 1).click();
    await expect(cell(0, 0, 'Color 1')).toBeVisible();
    await expect(cell(4, 0, 'Color 1')).toBeVisible();
    await expect(cell(0, 1, 'Color 2')).toBeVisible();
    await expect(cell(4, 1, 'Color 2')).toBeVisible();
    await cell(0, 0, 'Color 1').click();
    await expect(page.getByRole('status')).toContainText('End');
    await cell(1, 0).click();
    await expect(cell(1, 0, 'Color 1')).toBeVisible();
    await cell(0, 2).click();
    await expect(cell(0, 2, 'Color 3')).toBeVisible();
});
