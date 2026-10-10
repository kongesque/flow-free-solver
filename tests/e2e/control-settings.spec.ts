import { expect, test } from '@playwright/test';
import { openBoardOptions } from './board-options';

for (const width of [390, 1280]) {
    test(`optional generator and simplified controls at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('./');
        const generate = page.getByRole('button', { name: 'Generate', exact: true });
        await expect(generate).toBeVisible();
        const picker = await page.getByRole('group', { name: 'Editing tool' }).boundingBox();
        const solve = await page.getByRole('button', { name: 'Solve', exact: true }).boundingBox();
        expect(picker!.y + picker!.height).toBeLessThan(solve!.y);
        await openBoardOptions(page);
        const toggle = page.getByRole('switch', { name: 'Puzzle generator' });
        await expect(toggle).toBeChecked();
        const solver = await page.getByRole('combobox', { name: 'Solver Algorithm' }).boundingBox();
        const colorLabel = await page.getByRole('switch', { name: 'Color label' }).boundingBox();
        expect(solver!.y + solver!.height).toBeLessThan(colorLabel!.y);
        await expect(page.getByRole('combobox', { name: 'Solver Algorithm' }).locator('option').first()).toHaveText('Pruned DFS (recommended)');
        await expect(page.locator('.settings-toggles .label-setting-title')).toHaveText(['Color label', 'Board guides', 'Puzzle generator']);
        await expect(page.getByRole('button', { name: 'Reset', exact: true }).locator('.lucide-trash-2')).toHaveCount(1);
        await expect(page.getByText('A for red, B for blue, and so on.', { exact: true })).toHaveCount(0);
        await toggle.uncheck();
        await expect(generate).toHaveCount(0);
        await page.reload();
        await expect(generate).toHaveCount(0);
        await openBoardOptions(page);
        await expect(toggle).not.toBeChecked();
        await toggle.check();
        await page.reload();
        await expect(generate).toBeVisible();
        await openBoardOptions(page);
        await expect(toggle).toBeChecked();
        await toggle.uncheck();
        await expect(generate).toHaveCount(0);
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('warps');
        await page.getByRole('button', { name: 'Warps', exact: true }).click();
        const labels = await page.getByRole('switch', { name: 'Color label' }).boundingBox();
        for (const name of ['Open all top/bottom', 'Open all left/right']) {
            const action = page.getByRole('button', { name, exact: true });
            const rect = await action.boundingBox();
            expect(rect!.y + rect!.height).toBeLessThan(labels!.y);
            await action.click();
        }
        await expect(page.locator('.warp-marker').first()).toHaveCSS('stroke-width', '0.055px');
        await expect(page.getByRole('button', { name: /^Clear (walls|bridges|warps)$/ })).toHaveCount(0);
        await page.screenshot({ path: test.info().outputPath('simplified-controls.png'), fullPage: true });
    });
}
