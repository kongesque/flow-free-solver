import { test, expect, type Locator } from '@playwright/test';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { openBoardOptions } from './board-options';

// Compare document positions even when selecting an offscreen control scrolls the page.
const layoutBounds = (locator: Locator) => locator.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x + window.scrollX, y: bounds.y + window.scrollY, width: bounds.width, height: bounds.height };
});

for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 667 },
    { width: 390, height: 780 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 568, height: 320 },
    { width: 568, height: 264 },
    { width: 667, height: 375 },
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
        await expect(page.getByRole('combobox')).toHaveCount(viewport.width >= 960 ? 5 : 2);
        await expect(page.getByText('Size', { exact: true })).toBeVisible();
        await expect(page.getByText('Algorithm', { exact: true })).toBeVisible();
        const source = page.getByRole('link', { name: /View source on GitHub/ });
        await expect(source).toBeVisible();
        await expect(source).toHaveAttribute('href', 'https://github.com/Kongesque/flow-free-solver');
        await expect(source).toHaveAttribute('target', '_blank');
        await expect(source.locator('svg')).toBeVisible();
        expect((await source.locator('svg').boundingBox())!.width).toBe(24);
        const sourceBounds = await layoutBounds(source);
        expect(sourceBounds.height).toBeGreaterThanOrEqual(44);
        expect(sourceBounds.x + sourceBounds.width).toBeCloseTo(viewport.width - 12, 0);
        expect(sourceBounds.y).toBeCloseTo(12, 0);
        const titleColors = await page.locator('.title-letter').evaluateAll(letters =>
            letters.map(letter => getComputedStyle(letter).color));
        expect(titleColors).toHaveLength(6);
        expect(new Set(titleColors).size).toBe(6);
        const titleName = page.locator('.title-name');
        await expect(titleName).toHaveText('Flow Free');
        expect(await titleName.evaluate(element => getComputedStyle(element).color)).toBe('rgb(230, 228, 223)');
        await expect(page.getByRole('link', { name: 'About this solver', exact: true })).toHaveCount(0);
        const readMore = page.getByRole('link', { name: /Read more about this solver/ });
        await expect(readMore).toBeVisible();
        await expect(readMore).toHaveAttribute('href', 'https://www.kongesque.com/blog/flow-free-solver');
        await expect(readMore).toHaveAttribute('target', '_blank');
        await expect(page.locator('.solver-about > p')).toHaveText('Solve any Flow Free or Numberlink puzzle instantly. Powered by C/Wasm Heuristic BFS, SAT (Z3) & A* search. Read more');
        await expect(page.locator('.solver-methods')).toHaveText('Powered by C/Wasm Heuristic BFS, SAT (Z3) & A* search. Read more');
        expect(await readMore.evaluate(element => getComputedStyle(element).color)).toBe('rgb(138, 142, 140)');
        expect(await page.locator('.solver-about').evaluate(element => getComputedStyle(element).textAlign))
            .toBe(viewport.width >= 960 ? 'left' : 'center');
        const about = await layoutBounds(page.locator('.solver-about'));
        const actionButtons = await layoutBounds(page.locator('.control-actions'));
        expect(about.y).toBeGreaterThan(actionButtons.y + actionButtons.height);
        const initialBoard = await page.getByRole('article', { name: 'Puzzle Grid Board' }).boundingBox();
        const initialHeader = await layoutBounds(page.getByRole('heading', { name: /Flow Free Solver/i }));
        const status = await layoutBounds(page.getByRole('status'));
        const controls = await page.getByRole('region', { name: 'Game Controls' }).boundingBox();
        const desktop = viewport.width >= 960;
        const phonePortrait = viewport.width <= 600 && viewport.height >= viewport.width;
        const phoneLandscape = !desktop && viewport.width > viewport.height && viewport.height <= 600;
        const tip = page.locator('.solver-header p');
        await expect(tip).toHaveText('Tips: Click to place. Click again to remove.');
        expect((await layoutBounds(tip)).height).toBeLessThan(19);
        expect(await tip.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        const selectedLabelsFit = await page.locator('.primary-settings select').evaluateAll(selects => {
            const context = document.createElement('canvas').getContext('2d')!;
            return selects.every(element => {
                const select = element as HTMLSelectElement;
                const style = getComputedStyle(select);
                context.font = style.font;
                const available = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                return context.measureText(select.selectedOptions[0].text).width <= available;
            });
        });
        expect(selectedLabelsFit).toBe(true);
        if (!desktop && !phonePortrait) {
            expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
        }
        if (desktop) {
            await expect(page.locator('.solver-methods')).toBeVisible();
            await expect(page.locator('.desktop-board-options')).toBeVisible();
            await expect(page.locator('.board-options summary')).toBeHidden();
            await expect(page.getByRole('heading', { name: 'Board options', exact: true })).toBeVisible();
            expect(initialHeader.x).toBeGreaterThan(initialBoard!.x + initialBoard!.width);
            expect(controls!.x).toBeGreaterThan(initialBoard!.x + initialBoard!.width);
            expect(status.x + status.width / 2).toBeCloseTo(initialBoard!.x + initialBoard!.width / 2, 0);
            expect(status.y).toBeGreaterThan(initialBoard!.y + initialBoard!.height);
            expect(initialHeader.y).toBeCloseTo(initialBoard!.y, 0);
            expect(initialHeader.y + initialHeader.height).toBeLessThan(controls!.y);
            const tip = await layoutBounds(page.locator('.solver-header p'));
            expect(tip.x).toBeCloseTo(initialHeader.x, 0);
            expect(tip.y).toBeGreaterThan(initialHeader.y + initialHeader.height);
            expect(tip.y + tip.height).toBeLessThan(controls!.y);
            expect(tip.height).toBeLessThan(19);
            const options = await layoutBounds(page.locator('.desktop-board-options'));
            const actions = await layoutBounds(page.locator('.control-actions'));
            expect(actions.y).toBeGreaterThan(options.y + options.height);
            expect(controls!.y + controls!.height).toBeLessThanOrEqual(initialBoard!.y + initialBoard!.height);
        } else {
            await expect(page.locator('.solver-methods')).toBeVisible();
            const options = await layoutBounds(page.locator('.mobile-board-options'));
            expect(about.y).toBeGreaterThan(options.y + options.height);
            await expect(page.locator('.solver-header p')).toBeVisible();
            await expect(page.locator('.mobile-board-options')).not.toHaveAttribute('open', '');
            await expect(page.locator('.board-options summary')).toBeVisible();
            if (phoneLandscape) {
                expect(initialHeader.y + initialHeader.height).toBeLessThan(initialBoard!.y);
                expect(status.y).toBeGreaterThan(initialBoard!.y + initialBoard!.height);
                expect(controls!.x).toBeGreaterThan(initialBoard!.x + initialBoard!.width);
            } else {
                expect(initialHeader.y + initialHeader.height).toBeLessThan(status.y);
                expect(status.y + status.height).toBeLessThanOrEqual(initialBoard!.y);
                expect(controls!.y).toBeGreaterThanOrEqual(initialBoard!.y + initialBoard!.height);
            }
        }
        if (viewport.height >= 768 && !phonePortrait) {
            const bottomSpace = desktop ? 0 : await page.locator('.solver-shell').evaluate(element => {
                const shell = getComputedStyle(element);
                return parseFloat(shell.paddingBottom) + parseFloat(shell.getPropertyValue('--workspace-gap'));
            });
            const centeredBoard = desktop ? viewport.height / 2 : Math.min(
                viewport.height / 2,
                viewport.height - bottomSpace - controls!.height - initialBoard!.height / 2,
            );
            expect(initialBoard!.y + initialBoard!.height / 2).toBeCloseTo(centeredBoard, 0);
        }
        await openBoardOptions(page);
        await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeEnabled();
        const frame = await layoutBounds(page.getByRole('region', { name: 'Puzzle editor' }));
        expect(frame.y).toBeCloseTo(initialBoard!.y, 0);
        const stableControls = await layoutBounds(page.getByRole('region', { name: 'Game Controls' }));
        const heading = await layoutBounds(page.getByRole('heading', { name: /Flow Free Solver/i }));
        if (phonePortrait) {
            expect(frame.x).toBeGreaterThanOrEqual(2);
            expect(frame.width).toBeLessThanOrEqual(viewport.width - 4);
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

test('board options adapt between mobile and desktop while preserving endpoints', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true }).click();
    await openBoardOptions(page);
    await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.board-options summary')).toBeHidden();
    await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeVisible();
    await page.locator('.board-options summary').click();
    await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeHidden();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Cell 0,0 Color 1', exact: true })).toBeVisible();
    await openBoardOptions(page);
    await expect(page.getByRole('combobox', { name: 'Grid Width' })).toBeVisible();
});

test('keyboard editing uses a single grid tab stop and respects rectangular boundaries', async ({ page }) => {
    await page.goto('./');
    await openBoardOptions(page);
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
    await expect(page.locator('.desktop-board-options')).toBeVisible();
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
        await openBoardOptions(page);
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
            page.getByRole('status'),
            grid,
            page.getByRole('region', { name: 'Game Controls' }),
            page.locator('.control-actions button').first(),
            page.locator('.board-options:visible'),
        ];
        const initialBounds = await Promise.all(landmarks.map(layoutBounds));
        const expectStable = async () => {
            if (viewport.width < 960 && viewport.width > viewport.height) {
                expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
            }
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
