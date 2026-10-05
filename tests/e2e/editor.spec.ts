import { test, expect, type Locator } from '@playwright/test';
import { assertSolution } from '../fixtures/assert-solution.mjs';

// Compare document positions even when selecting an offscreen control scrolls the page.
const layoutBounds = (locator: Locator) => locator.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x + window.scrollX, y: bounds.y + window.scrollY, width: bounds.width, height: bounds.height };
});

for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 568, height: 320 },
    { width: 768, height: 1024 },
    { width: 959, height: 900 },
    { width: 960, height: 900 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1440, height: 1200 },
]) {
    test(`editor fits ${viewport.width}×${viewport.height} with square and rectangular boards`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('./');
        await expect(page.locator('.control-actions button')).toHaveCount(3);
        await expect(page.getByRole('combobox')).toHaveCount(2);
        await expect(page.getByText('Size', { exact: true })).toBeVisible();
        await expect(page.getByText('Algorithm', { exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: 'View source on GitHub' })).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'About this solver' })).toHaveCount(0);
        const initialBoard = await page.getByRole('article', { name: 'Puzzle Grid Board' }).boundingBox();
        const initialHeader = await layoutBounds(page.getByRole('heading', { name: /Flow Free Solver/i }));
        const status = await layoutBounds(page.getByRole('status'));
        const controls = await page.getByRole('region', { name: 'Game Controls' }).boundingBox();
        const desktop = viewport.width >= 960;
        if (desktop) {
            expect(initialHeader.x).toBeGreaterThan(initialBoard!.x + initialBoard!.width);
            expect(controls!.x).toBeGreaterThan(initialBoard!.x + initialBoard!.width);
            expect(status.x).toBeGreaterThan(initialBoard!.x + initialBoard!.width);
            expect(initialHeader.y).toBeCloseTo(initialBoard!.y, 0);
            expect(controls!.y + controls!.height).toBeLessThanOrEqual(initialBoard!.y + initialBoard!.height);
        } else {
            expect(initialHeader.y + initialHeader.height).toBeLessThan(status.y);
            expect(status.y + status.height).toBeLessThanOrEqual(initialBoard!.y);
            expect(controls!.y).toBeGreaterThanOrEqual(initialBoard!.y + initialBoard!.height);
        }
        if (viewport.height >= 768) {
            expect(initialBoard!.y + initialBoard!.height / 2).toBeCloseTo(viewport.height / 2, 0);
        } else if (viewport.width <= 600 && viewport.height >= viewport.width) {
            expect(Math.abs(initialBoard!.y + initialBoard!.height / 2 - viewport.height / 2)).toBeLessThan(12);
        }
        await page.locator('.board-options summary').click();
        await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeEnabled();
        const frame = await layoutBounds(page.getByRole('region', { name: 'Puzzle editor' }));
        expect(frame.y).toBeCloseTo(initialBoard!.y, 0);
        const stableControls = await layoutBounds(page.getByRole('region', { name: 'Game Controls' }));
        const heading = await layoutBounds(page.getByRole('heading', { name: /Flow Free Solver/i }));
        const phonePortrait = viewport.width <= 600 && viewport.height >= viewport.width;
        if (phonePortrait) {
            expect(frame.x).toBeCloseTo(2, 1);
            expect(frame.width).toBeCloseTo(viewport.width - 4, 1);
            expect(stableControls.x).toBeGreaterThanOrEqual(16);
            expect(stableControls.x + stableControls.width).toBeLessThanOrEqual(viewport.width - 16);
        }
        const squareSizes = Array.from({ length: 11 }, (_, index) => [index + 5, index + 5]);
        for (const [width, height] of [...squareSizes, [5, 15], [15, 5]]) {
            await page.getByRole('combobox', { name: 'Grid Width' }).selectOption(String(width));
            await page.getByRole('combobox', { name: 'Grid Height' }).selectOption(String(height));
            const grid = page.getByRole('article', { name: 'Puzzle Grid Board' });
            const bounds = await layoutBounds(grid);
            expect(bounds!.x).toBeGreaterThanOrEqual(0);
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
            expect(bounds!.width / bounds!.height).toBeCloseTo(width / height, 1);
            if (phonePortrait && width >= height) {
                expect(bounds.x).toBeCloseTo(2, 1);
                expect(bounds.width).toBeCloseTo(viewport.width - 4, 1);
            }
            expect(bounds!.width).toBeLessThanOrEqual(frame!.width + 1);
            expect(bounds!.height).toBeLessThanOrEqual(frame!.height + 1);
            expect(bounds!.x + bounds!.width / 2).toBeCloseTo(frame!.x + frame!.width / 2, 0);
            expect(bounds!.y + bounds!.height / 2).toBeCloseTo(frame!.y + frame!.height / 2, 0);
            const currentFrame = await layoutBounds(page.getByRole('region', { name: 'Puzzle editor' }));
            const currentControls = await layoutBounds(page.getByRole('region', { name: 'Game Controls' }));
            const currentHeading = await layoutBounds(page.getByRole('heading', { name: /Flow Free Solver/i }));
            expect(currentFrame!.y).toBeCloseTo(frame!.y, 1);
            expect(currentFrame!.height).toBeCloseTo(frame!.height, 1);
            expect(currentControls!.y).toBeCloseTo(stableControls!.y, 1);
            expect(currentHeading!.y).toBeCloseTo(heading!.y, 1);
            const cell = await grid.getByRole('button').first().boundingBox();
            expect(Math.abs(cell!.width - cell!.height)).toBeLessThan(1);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        }
        for (const control of await page.locator('.game-controls button:visible, .game-controls select:visible').all()) {
            const bounds = await control.boundingBox();
            expect(bounds!.height).toBeGreaterThanOrEqual(44);
            expect(bounds!.x).toBeGreaterThanOrEqual(0);
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
        }
    });
}

test('keyboard editing uses a single grid tab stop and respects rectangular boundaries', async ({ page }) => {
    await page.goto('./');
    await page.locator('.board-options summary').click();
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
    await expect(page.getByRole('combobox', { name: 'Grid Size' })).toBeFocused();
});


test('keeps the familiar automatic endpoint sequence and repairs removed pairs', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.board-options')).not.toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: 'Choose endpoint color' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
    const cell = (x: number, y: number, color = 'Empty') => page.getByRole('button', { name: `Cell ${x},${y} ${color}`, exact: true });
    await expect(page.getByRole('status')).toContainText('Start');
    await cell(0, 0).click();
    await expect(page.getByRole('status')).toContainText('End');
    await cell(4, 0).click();
    await expect(page.getByRole('status')).toContainText('Start');
    await cell(0, 1).click();
    await cell(4, 1).click();
    await expect(cell(0, 0, 'Color 1')).toBeVisible();
    await expect(cell(4, 0, 'Color 1')).toBeVisible();
    await expect(cell(0, 1, 'Color 2')).toBeVisible();
    await expect(cell(4, 1, 'Color 2')).toBeVisible();
    await cell(0, 0, 'Color 1').click();
    await expect(page.getByRole('status')).toContainText('End');
    await cell(1, 0).click();
    await expect(cell(1, 0, 'Color 1')).toBeVisible();
    await cell(0, 2).click();
    await expect(cell(0, 2, 'Color 3')).toBeVisible();
});

test.describe('touch input', () => {
    test.use({ hasTouch: true });
    test('grid lines and final cells respond to taps on a dense rectangular board', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('./');
        await page.locator('.board-options summary').click();
        await page.getByRole('combobox', { name: 'Grid Height' }).selectOption('15');
        const grid = page.getByRole('article', { name: 'Puzzle Grid Board' });
        const first = page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true });
        const bounds = await first.boundingBox();
        // Tap the one-pixel line between the first two cells.
        await page.touchscreen.tap(bounds!.x + bounds!.width + 0.5, bounds!.y + bounds!.height / 2);
        // Touch coordinates round to whole pixels, so either adjacent cell can be nearest.
        const placedEndpoint = page.getByRole('button', { name: /^Cell [01],0 Color 1$/ });
        await expect(placedEndpoint).toHaveCount(1);
        const placedName = await placedEndpoint.getAttribute('aria-label');
        await expect(grid.getByRole('button', { name: /Color/ })).toHaveCount(1);
        await page.getByRole('button', { name: 'Cell 4,14 Empty', exact: true }).tap();
        await expect(page.getByRole('button', { name: 'Cell 4,14 Color 1', exact: true })).toBeVisible();
        await page.getByRole('button', { name: placedName!, exact: true }).tap();
        await expect(page.getByRole('status')).toContainText('End');
        await expect(grid.getByRole('button', { name: /Color/ })).toHaveCount(1);
    });
});

for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 568, height: 320 },
    { width: 1440, height: 900 },
]) {
    test(`solution actions keep the page stable at ${viewport.width}×${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('./');
        const grid = page.getByRole('article', { name: 'Puzzle Grid Board' });
        await expect(grid.getByRole('button').first()).toBeEnabled();
        const landmarks = [
            page.getByRole('heading', { name: /Flow Free Solver/i }),
            grid,
            page.getByRole('region', { name: 'Game Controls' }),
            page.locator('.control-actions button').first(),
            page.locator('.board-options summary'),
        ];
        const initialBounds = await Promise.all(landmarks.map(layoutBounds));
        const expectStable = async () => {
            for (let index = 0; index < landmarks.length; index++) {
                const bounds = await layoutBounds(landmarks[index]);
                for (const property of ['x', 'y', 'width', 'height'] as const) {
                    expect(Math.abs(bounds[property] - initialBounds[index][property])).toBeLessThan(1);
                }
            }
        };
        const readRows = async () => {
            const values = await grid.getByRole('button').evaluateAll(cells =>
                cells.map(cell => Number(cell.getAttribute('aria-label')!.split('Color ')[1]) || 0));
            return Array.from({ length: 5 }, (_, y) => values.slice(y * 5, y * 5 + 5));
        };
        const validate = async (input: number[][]) => {
            const colors = ' RBYGOCMmPAWgTbcp';
            assertSolution(
                input.map(row => row.map(color => color ? colors[color] : '.').join('')).join('\n'),
                (await readRows()).map(row => row.map(color => colors.charCodeAt(color))),
            );
        };
        // Solve becomes Edit only after the real solver completes.
        for (let y = 0; y < 5; y++) {
            await page.getByRole('button', { name: `Cell 0,${y} Empty`, exact: true }).click();
            await page.getByRole('button', { name: `Cell 4,${y} Empty`, exact: true }).click();
        }
        const manual = await readRows();
        await expectStable();
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
        await validate(manual);
        await expectStable();
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
        await expectStable();
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Generated');
        await expectStable();
        if (viewport.width === 390 || viewport.width === 1440) {
            await page.screenshot({
                path: test.info().outputPath(viewport.width === 390 ? 'balanced-mobile.png' : 'balanced-desktop.png'),
                fullPage: true,
            });
        }
        await expect(page.getByRole('button', { name: /Show solution|Hide solution|Edit puzzle/ })).toHaveCount(0);
        const generated = await readRows();
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
        await validate(generated);
        await expectStable();
        if (viewport.width === 390) {
            await page.screenshot({ path: test.info().outputPath('stable-solve-edit.png'), fullPage: true });
        }
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        await expectStable();
        await grid.getByRole('button', { name: /Color/ }).first().click();
        await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
        await expectStable();
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await expectStable();
    });
}
