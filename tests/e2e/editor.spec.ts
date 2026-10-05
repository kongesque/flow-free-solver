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

test('chooses colors out of order, advances to incomplete pairs, and undoes endpoint edits', async ({ page }) => {
    await page.goto('./');
    const picker = page.getByRole('button', { name: 'Choose endpoint color' });
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    await expect(undo).toBeDisabled();
    await picker.click();
    await page.getByRole('button', { name: 'Purple, 0 of 2 endpoints', exact: true }).click();
    await expect(picker).toBeFocused();
    await page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Purple · End');
    await page.getByRole('button', { name: 'Cell 4,0 Empty', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Red · Start');
    await picker.click();
    await expect(page.getByRole('button', { name: 'Purple, 2 of 2 endpoints', exact: true })).toBeDisabled();
    await picker.press('Escape');
    await expect(picker).toHaveAttribute('aria-expanded', 'false');
    await expect(picker).toBeFocused();
    await undo.click();
    await expect(page.getByRole('button', { name: 'Cell 4,0 Empty', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Purple · End');
    await page.getByRole('button', { name: 'Cell 0,0 Color 9', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Red · Start');
    await undo.click();
    await expect(page.getByRole('button', { name: 'Cell 0,0 Color 9', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Purple · End');
    await undo.click();
    await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(25);
    await expect(undo).toBeDisabled();
});

test('keyboard editing uses a single grid tab stop and respects rectangular boundaries', async ({ page }) => {
    await page.goto('./');
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
    await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeFocused();
});

test('undo restores the generated solution after an endpoint is removed', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Generated solvable puzzle');
    const labels = await page.locator('.puzzle-grid button').evaluateAll(cells => cells.map(cell => cell.getAttribute('aria-label')));
    const endpoint = page.getByRole('button', { name: /Cell .* Color/ }).first();
    const originalLabel = await endpoint.getAttribute('aria-label');
    await endpoint.click();
    await expect(page.getByRole('button', { name: 'Show solution' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('button', { name: originalLabel!, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show solution' })).toBeVisible();
    expect(await page.locator('.puzzle-grid button').evaluateAll(cells => cells.map(cell => cell.getAttribute('aria-label')))).toEqual(labels);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('large mobile boards enlarge into scrollable 44px cells and return to fit', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('15');
    await page.getByRole('button', { name: 'Enlarge board', exact: true }).click();
    const first = page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true });
    const bounds = await first.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await first.click();
    await page.getByRole('button', { name: 'Cell 14,14 Empty', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cell 14,14 Color 1', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Fit board', exact: true }).click();
    const grid = await page.getByRole('article', { name: 'Puzzle Grid Board' }).boundingBox();
    expect(grid!.width).toBeLessThan(390);
    await expect(page.getByRole('button', { name: 'Cell 0,0 Color 1', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Cell 14,14 Color 1', exact: true })).toBeInViewport();
});
