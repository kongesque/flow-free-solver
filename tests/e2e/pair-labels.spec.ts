import { optIntoGenerator } from './board-options';
import { expect, test } from '@playwright/test';
import { openBoardOptions } from './board-options';

for (const width of [390, 1280]) {
    test(`color labels persist and stay on endpoints at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('./');
        const dots = page.locator('.endpoint-dot');
        await page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true }).click();
        await page.getByRole('button', { name: 'Cell 4,4 Empty', exact: true }).click();
        await expect(dots).toHaveText(['', '']);
        await openBoardOptions(page);
        const labels = page.getByRole('switch', { name: 'Color label' });
        await labels.check();
        await expect(dots).toHaveText(['A', 'A']);
        await expect(dots.first()).toHaveCSS('color', 'rgb(21, 23, 22)');
        // Puzzle persistence is debounced by 500ms; allow the newly placed endpoints to save.
        await page.waitForTimeout(700);
        await page.reload();
        await expect(dots).toHaveText(['A', 'A']);
        await openBoardOptions(page);
        await expect(labels).toBeChecked();
        await labels.check();
        await page.screenshot({ path: test.info().outputPath('pair-labels.png'), fullPage: true });
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeEnabled();
        const endpointLabels = await dots.allTextContents();
        expect(endpointLabels.length).toBeGreaterThan(0);
        expect(endpointLabels.every(label => /^[A-P]$/.test(label))).toBe(true);
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
        await expect(dots).toHaveText(endpointLabels);
        await labels.uncheck();
        await expect(dots).toHaveText(endpointLabels.map(() => ''));
    });
}

test.beforeEach(async ({ page }) => { await optIntoGenerator(page); });


test('all sixteen colors use the requested letters without changing saved color IDs', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('combobox', { name: 'Grid Size', exact: true }).selectOption('8');
    await openBoardOptions(page);
    await page.getByRole('switch', { name: 'Color label', exact: true }).check();
    const palette = [
        ['A', 'Bright Red', 'rgb(255, 0, 0)'], ['C', 'Blue', 'rgb(0, 0, 255)'],
        ['D', 'Yellow', 'rgb(255, 255, 0)'], ['B', 'Dark Green', 'rgb(0, 128, 0)'],
        ['E', 'Orange', 'rgb(255, 165, 0)'], ['F', 'Cyan', 'rgb(0, 255, 255)'],
        ['G', 'Magenta', 'rgb(255, 0, 255)'], ['H', 'Maroon', 'rgb(128, 0, 0)'],
        ['I', 'Purple', 'rgb(128, 0, 128)'], ['K', 'Lavender Gray', 'rgb(196, 195, 208)'],
        ['J', 'White', 'rgb(255, 255, 255)'], ['L', 'Lime Green', 'rgb(0, 255, 0)'],
        ['M', 'Tan', 'rgb(210, 180, 140)'], ['N', 'Indigo', 'rgb(75, 0, 130)'],
        ['O', 'Teal', 'rgb(0, 128, 128)'], ['P', 'Light Pink', 'rgb(255, 192, 203)'],
    ];
    for (let i = 0; i < palette.length; i++) {
        const [letter, name, rgb] = palette[i];
        for (let end = 0; end < 2; end++) {
            const index = 2 * i + end, x = index % 8, y = Math.floor(index / 8);
            const cell = page.locator(`[data-cell="${x},${y}"]`);
            await cell.click();
            await expect(cell).toHaveAttribute('aria-label', `Cell ${x},${y} Color ${i + 1}`);
            await expect(cell).toHaveAttribute('aria-description', `${letter}, ${name}`);
            await expect(cell.locator('.endpoint-dot')).toHaveText(letter);
            await expect(cell.locator('.endpoint-dot')).toHaveCSS('background-color', rgb);
        }
    }
    await expect.poll(() => page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('flow-solver-db'); request.onsuccess = () => resolve(request.result); });
        const board = await new Promise<number[][] | undefined>(resolve => { const request = db.transaction('puzzle-state').objectStore('puzzle-state').get('current'); request.onsuccess = () => resolve(request.result?.board); });
        db.close(); return board?.flat().filter(Boolean).length;
    })).toBe(32);
    await page.reload();
    for (let i = 0; i < palette.length; i++) {
        await expect(page.locator(`[data-cell="${2 * i % 8},${Math.floor(2 * i / 8)}"] .endpoint-dot`)).toHaveText(palette[i][0]);
    }
});
