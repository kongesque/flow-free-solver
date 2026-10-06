import { expect, test, type Locator } from '@playwright/test';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { wallCorridor } from '../fixtures/wall-puzzles.mjs';

const bounds = (locator: Locator) => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
});

for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 568, height: 264 },
    { width: 960, height: 900 },
    { width: 1280, height: 900 },
]) {
    test(`tool panel keeps the board and primary action stable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('./');
        const editor = page.getByRole('region', { name: 'Puzzle editor' });
        const tools = page.getByRole('group', { name: 'Editing tool', exact: true });
        const action = page.locator('.primary-action');
        const originalBoard = await bounds(editor);
        const originalAction = await bounds(action);
        const expectStable = async () => {
            expect(await bounds(editor)).toEqual(originalBoard);
            expect(await bounds(action)).toEqual(originalAction);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        };
        await expect(tools.getByRole('button')).toHaveCount(2);
        await expect(page.getByRole('button', { name: 'Dots', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('group', { name: 'Wall tools', exact: true })).toHaveCount(0);
        expect((await bounds(tools)).y).toBeLessThan(originalAction.y);
        if (viewport.width >= 960) {
            await expect(page.locator('.desktop-board-options')).toBeVisible();
            expect((await bounds(page.getByRole('region', { name: 'Game Controls' }))).x)
                .toBeGreaterThan(originalBoard.x + originalBoard.width);
        } else {
            const options = page.locator('.mobile-board-options');
            await expect(options).not.toHaveAttribute('open', '');
            await options.locator('summary').click();
            await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeVisible();
            await expectStable();
            await options.locator('summary').click();
        }
        const fixture = wallCorridor(5, 5);
        await page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true }).click();
        await page.getByRole('button', { name: 'Cell 4,4 Empty', exact: true }).click();
        await page.getByRole('button', { name: 'Walls', exact: true }).click();
        await expectStable();
        await expect(page.getByRole('button', { name: 'Walls', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('group', { name: 'Wall tools', exact: true })).toBeVisible();
        for (const { x, y, side } of fixture.walls) {
            await page.getByRole('button', { name: new RegExp(`^Cell ${x},${y} `) }).focus();
            await page.keyboard.press(side === 'right' ? 'Shift+ArrowRight' : 'Shift+ArrowDown');
        }
        await expect(page.locator('.wall-count')).toHaveText('16');
        await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Generate', exact: true })).toHaveAccessibleDescription(/Clear walls to generate/);
        await expectStable();
        for (const control of await page.locator('.game-controls button:visible').all()) {
            expect((await bounds(control)).height).toBeGreaterThanOrEqual(44);
        }
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
        const colors = await page.locator('.puzzle-grid button').evaluateAll(cells =>
            cells.map(cell => Number(cell.getAttribute('aria-label')!.split('Color ')[1]) || 0));
        assertSolution(fixture.input, Array.from({ length: 5 }, (_, y) =>
            colors.slice(y * 5, y * 5 + 5).map(color => '.RBYGOCMmPAWgTbcp'.charCodeAt(color))), fixture.walls);
        await expectStable();
        await expect(page.getByRole('button', { name: 'Undo wall', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        await expectStable();
        await expect(page.getByRole('button', { name: 'Undo wall', exact: true })).toBeEnabled();
        await page.screenshot({ path: test.info().outputPath('tool-panel.png'), fullPage: true });
    });
}
