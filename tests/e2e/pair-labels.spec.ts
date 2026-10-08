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
