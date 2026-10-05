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
        expect(initial[1].width).toBeCloseTo(width - 4, 0);
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
        expect((await documentBounds(board)).width).toBeCloseTo(width - 4, 0);
    });
}
