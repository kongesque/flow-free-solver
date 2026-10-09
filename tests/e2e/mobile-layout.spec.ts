import { expect, test, type Locator } from '@playwright/test';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { openBoardOptions } from './board-options';

const documentBounds = (locator: Locator) => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
});

for (const width of [320, 390, 402, 430]) {
    test(`portrait board remains stable when browser toolbars change the viewport at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 874 });
        await page.goto('./');
        await expect(page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true })).toBeEnabled();
        const board = page.getByRole('article', { name: 'Puzzle Grid Board' });
        const landmarks = [page.locator('.solver-header'), board, page.locator('.control-actions')];
        const initial = await Promise.all(landmarks.map(documentBounds));
        expect(initial[1].width).toBeCloseTo(width - 32, 0);
        for (const height of [680, 700, 780, 874]) {
            await page.setViewportSize({ width, height });
            for (let index = 0; index < landmarks.length; index++) {
                const current = await documentBounds(landmarks[index]);
                for (const key of ['x', 'y', 'width', 'height'] as const) {
                    expect(current[key]).toBeCloseTo(initial[index][key], 0);
                }
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
        // Scrolling reveals the footer instead of reducing the play area.
        const link = page.getByRole('link', { name: /Read more about this solver/ });
        await link.scrollIntoViewIfNeeded();
        await expect(link).toBeInViewport();
        expect((await documentBounds(board)).width).toBeCloseTo(width - 32, 0);
    });
}

test.describe('Touch guides across browsers', () => {
    test.use({ hasTouch: true });
    test('native taps place exactly one endpoint and coordinates preserve the board', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('./');
        const board = page.getByRole('article', { name: 'Puzzle Grid Board' });
        await expect(page.locator('[data-cell="0,0"]')).toBeEnabled();
        await page.locator('[data-cell="0,0"]').tap();
        await expect(page.locator('.endpoint-dot')).toHaveCount(1);
        await page.locator('[data-cell="4,4"]').tap();
        await expect(page.locator('.endpoint-dot')).toHaveCount(2);
        await expect(page.locator('[data-cell="4,4"]')).toHaveAttribute('aria-label', 'Cell 4,4 Color 1');
        const before = await documentBounds(board);
        await page.locator('.board-options summary').click();
        await page.getByRole('switch', { name: 'Board guides', exact: true }).check();
        expect(await documentBounds(board)).toEqual(before);
        await expect(page.locator('.board-columns')).toHaveText('ABCDE');
        await page.locator('[data-cell="2,2"]').tap();
        await expect(page.locator('.endpoint-dot')).toHaveCount(3);
        await expect(page.locator('[data-cell="2,2"]')).toHaveAttribute('aria-description', 'C3');
        await expect(page.locator('.board-rows')).toHaveText('12345');
    });
});

test('19x19 editing and real worker solving fit a mobile screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./'); await openBoardOptions(page);
    await page.getByRole('combobox', { name: 'Grid Width' }).selectOption('19');
    await page.getByRole('combobox', { name: 'Grid Height' }).selectOption('19');
    for (let i = 0; i < 10; i++) {
        const pair = i === 9 ? [[9, 8], [9, 9]] : [[i, i === 0 ? 0 : i - 1], [i + 2, i]];
        for (const [x, y] of pair) await page.locator(`[data-cell="${x},${y}"]`).click();
    }
    const chars = '.RBYGOCMmPAWgTbcp';
    const values = () => page.locator('[data-cell]').evaluateAll(cells => cells.map(cell =>
        Number(cell.getAttribute('aria-label')?.split('Color ')[1]) || 0));
    const input = await values();
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solved');
    const solved = await values();
    assertSolution(Array.from({ length: 19 }, (_, y) => input.slice(y * 19, (y + 1) * 19).map(c => chars[c]).join('')).join('\n'),
        Array.from({ length: 19 }, (_, y) => solved.slice(y * 19, (y + 1) * 19).map(c => chars.charCodeAt(c))));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
