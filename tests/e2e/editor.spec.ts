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
        for (const control of await page.locator('.controls-panel button, .controls-panel select').all()) {
            const bounds = await control.boundingBox();
            expect(bounds!.height).toBeGreaterThanOrEqual(44);
            expect(bounds!.x).toBeGreaterThanOrEqual(0);
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
        }
    });
}
