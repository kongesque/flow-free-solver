import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { openBoardOptions } from './board-options';

const cell = (page: Page, x: number, y: number) => page.locator(`[data-cell="${x},${y}"]`);
async function point(page: Page, x: number, y: number) {
    const box = (await cell(page, x, y).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
}
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', position?: { x: number; y: number; id: number }) {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: position ? [position] : [] });
}
async function verifyLabelBounds(page: Page, width: number) {
    for (const axis of ['.board-columns', '.board-rows']) {
        const bounds = await page.locator(`${axis} span`).evaluateAll(labels => labels.filter(label => label.textContent).map(label => {
            const range = document.createRange(); range.selectNodeContents(label);
            const rect = range.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        }));
        for (let i = 1; i < bounds.length; i++) {
            expect(axis === '.board-columns' ? bounds[i].left - bounds[i - 1].right : bounds[i].top - bounds[i - 1].bottom).toBeGreaterThanOrEqual(0);
        }
        for (const rect of bounds) { expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width); }
    }
}

for (const width of [320, 390, 1280]) {
    test(`coordinates default off, persist independently, and keep the board stable at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto('./');
        await openBoardOptions(page);
        const toggle = page.getByRole('switch', { name: 'Board guides', exact: true });
        await expect(toggle).not.toBeChecked();
        await expect(page.locator('.board-coordinates')).toHaveCount(0);
        await cell(page, 2, 3).hover();
        await expect(page.locator('.cell-guide')).toHaveCount(0);
        await expect(page.locator('.endpoint-preview')).toHaveCount(0);
        await cell(page, 2, 3).focus();
        await cell(page, 2, 3).press('ArrowRight');
        await expect(cell(page, 3, 3)).toBeFocused();
        await expect(page.locator('.cell-guide')).toHaveCount(0);
        const grid = page.getByRole('article', { name: 'Puzzle Grid Board' });
        const before = await grid.boundingBox();
        await toggle.check();
        expect(await grid.boundingBox()).toEqual(before);
        await expect(page.locator('.board-columns')).toHaveText('ABCDE');
        await expect(page.locator('.board-rows')).toHaveText('12345');
        const status = await page.getByRole('status').textContent();
        await cell(page, 2, 3).hover();
        await expect(page.locator('.board-columns .coordinate-active')).toHaveText('C');
        await expect(page.locator('.board-rows .coordinate-active')).toHaveText('4');
        await expect(cell(page, 2, 3)).toHaveClass(/cell-guide-active/);
        expect(await page.getByRole('status').textContent()).toBe(status);
        await expect(page.locator('.endpoint-dot')).toHaveCount(0);
        await cell(page, 2, 3).focus();
        await cell(page, 2, 3).press('ArrowRight');
        await expect(cell(page, 3, 3)).toBeFocused();
        await expect(page.locator('.board-columns .coordinate-active')).toHaveText('D');
        await cell(page, 3, 3).press('Enter');
        await expect(cell(page, 3, 3)).toHaveAttribute('aria-label', 'Cell 3,3 Color 1');
        await expect.poll(() => page.evaluate(async () => {
            const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('flow-solver-db'); request.onsuccess = () => resolve(request.result); });
            const board = await new Promise<number[][] | undefined>(resolve => { const request = db.transaction('puzzle-state').objectStore('puzzle-state').get('current'); request.onsuccess = () => resolve(request.result?.board); });
            db.close(); return board?.flat().filter(Boolean).length;
        })).toBe(1);
        await toggle.uncheck();
        expect(await grid.boundingBox()).toEqual(before);
        await toggle.check();
        await page.reload();
        await openBoardOptions(page);
        await expect(toggle).toBeChecked();
        await expect(page.getByRole('switch', { name: 'Color label', exact: true })).not.toBeChecked();
        await expect(page.locator('.endpoint-dot')).toHaveCount(1);
        await toggle.uncheck();
        await page.reload();
        await expect(page.locator('.board-coordinates')).toHaveCount(0);
    });
}

test('coordinates adapt to rectangles and dense boards without overlapping labels', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('./');
    await openBoardOptions(page);
    await page.getByRole('switch', { name: 'Board guides', exact: true }).check();
    await page.getByRole('combobox', { name: 'Grid Width', exact: true }).selectOption('15');
    await page.getByRole('combobox', { name: 'Grid Height', exact: true }).selectOption('10');
    await expect(page.locator('.board-columns span')).toHaveCount(15);
    await expect(page.locator('.board-rows span')).toHaveCount(10);
    await expect(page.locator('.board-columns span').last()).toHaveText('O');
    await expect(page.locator('.board-rows span').last()).toHaveText('10');
    await cell(page, 8, 7).hover();
    await expect(page.locator('.board-columns .coordinate-active')).toHaveText('I');
    await expect(page.locator('.board-rows .coordinate-active')).toHaveText('8');
    await verifyLabelBounds(page, 320);
    await page.screenshot({ path: test.info().outputPath('dense-coordinates.png'), fullPage: true });
    await page.setViewportSize({ width: 568, height: 264 });
    await page.getByRole('combobox', { name: 'Grid Height', exact: true }).selectOption('15');
    await cell(page, 8, 7).hover();
    await expect(page.locator('.board-columns .coordinate-active')).toHaveText('I');
    await expect(page.locator('.board-rows .coordinate-active')).toHaveText('8');
    await expect.poll(() => page.locator('.board-columns span').evaluateAll(labels => labels.filter(label => label.textContent).length)).toBeLessThan(15);
    await verifyLabelBounds(page, 568);
});

test.describe('Touch placement guides', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('press and slide previews a dot; release commits once and outside/cancel/resize preserve endpoints', async ({ page }) => {
        await page.goto('./');
        await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeEnabled();
        await openBoardOptions(page);
        await page.getByRole('switch', { name: 'Board guides', exact: true }).check();
        await page.locator('.board-options summary').click();
        await cell(page, 0, 0).scrollIntoViewIfNeeded();
        const cdp = await page.context().newCDPSession(page);
        await touch(cdp, 'touchStart', await point(page, 0, 0));
        await expect(page.locator('.endpoint-dot')).toHaveCount(0);
        await expect(cell(page, 0, 0)).toHaveClass(/touch-preview/);
        await touch(cdp, 'touchMove', await point(page, 3, 2));
        await expect(cell(page, 3, 2)).toHaveClass(/touch-preview/);
        await expect(cell(page, 3, 2).locator('.endpoint-preview')).toHaveCSS('opacity', '0.4');
        await touch(cdp, 'touchEnd');
        await expect(page.locator('.endpoint-dot')).toHaveCount(1);
        await expect(cell(page, 3, 2)).toHaveAttribute('aria-label', 'Cell 3,2 Color 1');
        await cell(page, 4, 4).tap();
        await expect(page.locator('.endpoint-dot')).toHaveCount(2);
        await expect(cell(page, 4, 4)).toHaveAttribute('aria-label', 'Cell 4,4 Color 1');

        await touch(cdp, 'touchStart', await point(page, 1, 1));
        const outside = (await page.locator('.puzzle-grid').boundingBox())!;
        await touch(cdp, 'touchMove', { x: outside.x + outside.width + 8, y: outside.y, id: 1 });
        await touch(cdp, 'touchEnd');
        await expect(page.locator('.endpoint-dot')).toHaveCount(2);
        await touch(cdp, 'touchStart', await point(page, 1, 1));
        await touch(cdp, 'touchCancel');
        await expect(page.locator('.endpoint-dot')).toHaveCount(2);
        await touch(cdp, 'touchStart', await point(page, 1, 1));
        await page.setViewportSize({ width: 844, height: 390 });
        await expect(page.locator('.touch-preview')).toHaveCount(0);
        await touch(cdp, 'touchEnd');
        await expect(page.locator('.endpoint-dot')).toHaveCount(2);
        await cell(page, 2, 2).tap();
        await expect(page.locator('.endpoint-dot')).toHaveCount(3);
        await cdp.detach();
    });

    test('turning guides off cancels a pending slide and restores ordinary taps', async ({ page }) => {
        await page.goto('./');
        await openBoardOptions(page);
        const toggle = page.getByRole('switch', { name: 'Board guides', exact: true });
        await cell(page, 0, 0).tap();
        await expect(page.locator('.endpoint-dot')).toHaveCount(1);
        await expect(page.locator('.cell-guide, .endpoint-preview')).toHaveCount(0);
        await toggle.check();
        const cdp = await page.context().newCDPSession(page);
        await touch(cdp, 'touchStart', await point(page, 1, 1));
        await touch(cdp, 'touchMove', await point(page, 2, 2));
        await expect(cell(page, 2, 2)).toHaveClass(/touch-preview/);
        await toggle.uncheck();
        await touch(cdp, 'touchEnd');
        await expect(page.locator('.endpoint-dot')).toHaveCount(1);
        await expect(page.locator('.cell-guide, .endpoint-preview')).toHaveCount(0);
        await cell(page, 4, 4).tap();
        await expect(page.locator('.endpoint-dot')).toHaveCount(2);
        await expect(cell(page, 4, 4)).toHaveAttribute('aria-label', 'Cell 4,4 Color 1');
        await cell(page, 4, 3).tap();
        await expect(page.locator('.endpoint-dot')).toHaveCount(3);
        await expect(cell(page, 4, 3)).toHaveAttribute('aria-label', 'Cell 4,3 Color 2');
        await cdp.detach();
    });

    test('bridge placement slides to the final cell and mode changes cancel a pending placement', async ({ page }) => {
        await page.goto('./');
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('bridges');
        await page.getByRole('button', { name: 'Bridges', exact: true }).click();
        await openBoardOptions(page);
        await page.getByRole('switch', { name: 'Board guides', exact: true }).check();
        await page.locator('.board-options summary').click();
        await cell(page, 0, 0).scrollIntoViewIfNeeded();
        const cdp = await page.context().newCDPSession(page);
        await touch(cdp, 'touchStart', await point(page, 1, 1));
        await touch(cdp, 'touchMove', await point(page, 3, 3));
        await expect(page.locator('[data-bridge]')).toHaveCount(0);
        await touch(cdp, 'touchEnd');
        await expect(page.locator('[data-bridge]')).toHaveCount(1);
        await expect(cell(page, 3, 3)).toHaveAttribute('aria-label', /Bridge/);
        await touch(cdp, 'touchStart', await point(page, 2, 2));
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('warps');
        await touch(cdp, 'touchEnd');
        await expect(page.locator('.endpoint-dot')).toHaveCount(0);
        await expect(page.locator('[data-bridge]')).toHaveCount(0);
        await cell(page, 0, 0).tap();
        await expect(page.locator('.endpoint-dot')).toHaveCount(1);
        await cdp.detach();
    });
});
