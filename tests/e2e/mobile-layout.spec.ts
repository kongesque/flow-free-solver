import { expect, test, type Locator } from '@playwright/test';

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
        await page.getByRole('switch', { name: 'Coordinates', exact: true }).check();
        expect(await documentBounds(board)).toEqual(before);
        await expect(page.locator('.board-columns')).toHaveText('ABCDE');
        await page.locator('[data-cell="2,2"]').tap();
        await expect(page.locator('.endpoint-dot')).toHaveCount(3);
        await expect(page.locator('[data-cell="2,2"]')).toHaveAttribute('aria-description', 'C3');
        await expect(page.locator('.board-rows')).toHaveText('12345');
    });
});
