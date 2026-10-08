import { optIntoGenerator } from './board-options';
import { expect, test, type Page } from '@playwright/test';
import { openBoardOptions } from './board-options';
import { warpRows, bridgeCross, type TopologyFixture } from '../fixtures/topology-puzzles.mjs';
import { assertTopologySolution } from '../fixtures/assert-topology-solution.mjs';
import type { PuzzleSolution } from '../../src/solver/logic/solution';

const cell = (page: Page, x: number, y: number) => page.locator(`[data-cell="${x},${y}"]`);
async function recreate(page: Page, fixture: TopologyFixture) {
    await openBoardOptions(page);
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(fixture.mode);
    await page.getByRole('combobox', { name: 'Grid Width' }).selectOption(String(fixture.width));
    await page.getByRole('combobox', { name: 'Grid Height' }).selectOption(String(fixture.height));
    const colors = [...new Set(fixture.board.flat())].filter(Boolean).sort((a, b) => a - b);
    for (const color of colors) for (let y = 0; y < fixture.height; y++) for (let x = 0; x < fixture.width; x++) {
        if (fixture.board[x][y] === color) await cell(page, x, y).click();
    }
    await page.getByRole('button', { name: 'Walls', exact: true }).click();
    for (const wall of fixture.topology.walls) {
        await cell(page, wall.x, wall.y).focus();
        await page.keyboard.press(wall.side === 'right' ? 'Shift+ArrowRight' : 'Shift+ArrowDown');
    }
    if (fixture.mode === 'warps') {
        await page.getByRole('button', { name: 'Warps', exact: true }).click();
        for (const seam of fixture.topology.warps) await page.getByRole('button', {
            name: `${seam.axis === 'horizontal' ? 'Row' : 'Column'} ${seam.index + 1} warp, ${seam.axis === 'horizontal' ? 'left' : 'top'}`, exact: true,
        }).click();
    } else {
        await page.getByRole('button', { name: 'Bridges', exact: true }).click();
        for (const bridge of fixture.topology.bridges) await cell(page, bridge.x, bridge.y).click();
    }
}
async function solveAndValidate(page: Page, fixture: TopologyFixture) {
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solved');
    const solution = JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!) as PuzzleSolution;
    assertTopologySolution(fixture, solution);
    await expect(page.locator('.endpoint-dot')).toHaveCount(fixture.solution.paths.length * 2);
    await expect(page.locator('.pipe-overlay')).toBeVisible();
    expect(await page.locator('.pipe-overlay path').count()).toBeGreaterThan(0);
}
async function state(page: Page) {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('flow-solver-db'); r.onsuccess = () => resolve(r.result); });
        const saved = await new Promise<Record<string, any>>(resolve => { const r = db.transaction('puzzle-state').objectStore('puzzle-state').get('current'); r.onsuccess = () => resolve(r.result); });
        db.close(); return saved;
    });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    test(`wall and warp markers share rail color with thicker lines at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('./');
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('bridges');
        await page.getByRole('button', { name: 'Bridges', exact: true }).click();
        await cell(page, 2, 2).click();
        const railStyle = await page.locator('.bridge-rail').first().evaluate(element => {
            const style = getComputedStyle(element);
            return { stroke: style.stroke, width: style.strokeWidth, dash: style.strokeDasharray };
        });
        await page.getByRole('button', { name: 'Walls', exact: true }).click();
        await cell(page, 1, 1).focus();
        await page.keyboard.press('Shift+ArrowRight');
        const markerStyle = (selector: string) => page.locator(selector).first().evaluate(element => {
            const style = getComputedStyle(element);
            return { stroke: style.stroke, width: style.strokeWidth, dash: style.strokeDasharray };
        });
        expect(await markerStyle('.puzzle-wall')).toEqual({ ...railStyle, width: '0.055px' });
        await page.getByRole('button', { name: 'Dots', exact: true }).click();
        await page.screenshot({ path: test.info().outputPath('bridge-walls.png'), fullPage: true });
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('warps');
        await page.getByRole('button', { name: 'Walls', exact: true }).click();
        await cell(page, 1, 1).focus();
        await page.keyboard.press('Shift+ArrowRight');
        await page.getByRole('button', { name: 'Warps', exact: true }).click();
        const left = page.getByRole('button', { name: 'Row 3 warp, left', exact: true });
        const right = page.getByRole('button', { name: 'Row 3 warp, right', exact: true });
        await left.click();
        await expect(right).toHaveAttribute('aria-pressed', 'true');
        await page.getByRole('button', { name: 'Column 3 warp, top', exact: true }).click();
        await left.focus();
        await expect(page.locator('[data-warp="horizontal-2"].paired')).toHaveCount(2);
        await page.getByRole('button', { name: 'Dots', exact: true }).click();
        await expect(page.locator('.warp-marker')).toHaveCount(4);
        expect(await markerStyle('.warp-marker')).toEqual({ ...railStyle, width: '0.055px', dash: '0.1px, 0.08px' });
        const warpLines = await page.locator('.warp-marker').evaluateAll(elements => elements.map(element => {
            const path = element as SVGPathElement;
            const length = path.getTotalLength();
            return [0, .25, .5, .75, 1].map(fraction => {
                const point = path.getPointAtLength(length * fraction);
                return [point.x, point.y];
            });
        }));
        for (const points of warpLines) {
            // A warp follows the full cell edge as one straight dashed line.
            for (const [x] of points) expect(x).toBeCloseTo(points[0][0]);
            expect(points[0][1]).toBeCloseTo(0);
            expect(points[4][1]).toBeCloseTo(1);
        }
        expect(await markerStyle('.puzzle-wall')).toEqual({ ...railStyle, width: '0.055px' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: test.info().outputPath('warp-walls.png'), fullPage: true });
    });
    test(`horizontal bridge arches preserve both lane routes and board position at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('./');
        const fixture = bridgeCross();
        await recreate(page, fixture);
        await expect(page.getByRole('combobox', { name: 'Bridge on top' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Rotate bridges', exact: true })).toHaveCount(0);
        await page.locator('.board-options summary').click();
        const grid = page.getByRole('article', { name: 'Puzzle Grid Board' });
        const initialBounds = await grid.boundingBox();
        const bridge = page.locator('[data-bridge="2,2"]');
        const rails = bridge.locator('.bridge-rail');
        await expect(rails).toHaveCount(2);
        const railShapes = await rails.evaluateAll(elements => elements.map(element => {
            const path = element as SVGPathElement;
            const length = path.getTotalLength();
            const start = path.getPointAtLength(0);
            const middle = path.getPointAtLength(length / 2);
            const end = path.getPointAtLength(length);
            return { d: path.getAttribute('d')!, start: [start.x, start.y], middle: [middle.x, middle.y], end: [end.x, end.y] };
        }));
        for (const rail of railShapes) {
            // Each rail connects both cell edges through one raised arch,
            // without the disconnected subpaths that left gaps at the joins.
            expect(rail.d.match(/M/gi)).toHaveLength(1);
            expect(rail.start[0]).toBeCloseTo(-.5);
            expect(rail.end[0]).toBeCloseTo(.5);
            expect(rail.start[1]).toBeCloseTo(rail.end[1]);
            expect(rail.middle[1]).toBeLessThan(rail.start[1]);
        }
        await page.screenshot({ path: test.info().outputPath('bridge-editor.png'), fullPage: true });
        await solveAndValidate(page, fixture);
        await expect(cell(page, 2, 2)).toHaveAccessibleName(/Bridge horizontal on top; vertical Color 1; horizontal Color 2/);
        expect(await rails.evaluateAll(elements => elements.map(element => element.getAttribute('d')))).toEqual(railShapes.map(rail => rail.d));
        // The opaque deck hides the vertical route at the raised crossing,
        // while leaving its continuation visible below the arch.
        for (const selector of ['.bridge-deck', '.bridge-flow']) {
            expect(await bridge.locator(selector).evaluate(element => {
                const path = element as SVGPathElement;
                return { crossing: path.isPointInFill(new DOMPoint(0, -.2)), underneath: path.isPointInFill(new DOMPoint(0, .1)) };
            })).toEqual({ crossing: true, underneath: false });
        }
        expect(await grid.boundingBox()).toEqual(initialBounds);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: test.info().outputPath('bridge-solved.png'), fullPage: true });
        // Older saves may have a vertical presentation; preserve routes while
        // adopting the fixed horizontal overpass on reload.
        await expect.poll(async () => (await state(page))?.bridges).toEqual(fixture.topology.bridges);
        await page.evaluate(async () => {
            const db = await new Promise<IDBDatabase>(resolve => {
                const request = indexedDB.open('flow-solver-db');
                request.onsuccess = () => resolve(request.result);
            });
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction('puzzle-state', 'readwrite');
                const store = transaction.objectStore('puzzle-state');
                const request = store.get('current');
                request.onsuccess = () => {
                    const saved = request.result;
                    saved.bridges[0].over = 'vertical';
                    saved.drafts.bridges.bridges[0].over = 'vertical';
                    store.put(saved, 'current');
                };
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
            db.close();
        });
        await page.reload();
        await expect(cell(page, 2, 2)).toHaveAccessibleName('Cell 2,2 Bridge horizontal on top');
        await solveAndValidate(page, fixture);
    });
}

for (const fixture of [warpRows(), warpRows(8, 5, true), bridgeCross(), bridgeCross(true)]) {
    test(`edit, solve, reload and preserve ${fixture.mode} ${fixture.width}x${fixture.height} through real workers`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto('./'); await recreate(page, fixture);
        await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeVisible();
        await solveAndValidate(page, fixture);
        await page.screenshot({ path: test.info().outputPath(`${fixture.mode}-solved.png`) });
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        await expect.poll(async () => (await state(page))?.board).toEqual(fixture.board);
        await expect.poll(async () => (await state(page))?.[fixture.mode]?.length).toBe(fixture.topology[fixture.mode].length);
        await page.reload(); await openBoardOptions(page);
        await expect(page.getByRole('combobox', { name: 'Game Mode' })).toHaveValue(fixture.mode);
        await solveAndValidate(page, fixture);
        expect(errors).toEqual([]);
    });
}

test('warp pairs, keyboard edits, bulk Undo and mode histories preserve separate drafts', async ({ page }) => {
    await page.goto('./'); await openBoardOptions(page);
    await cell(page, 0, 0).click();
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('warps');
    await page.getByRole('button', { name: 'Warps', exact: true }).click();
    const left = page.getByRole('button', { name: 'Row 3 warp, left', exact: true });
    const right = page.getByRole('button', { name: 'Row 3 warp, right', exact: true });
    await left.click(); await expect(right).toHaveAttribute('aria-pressed', 'true');
    await right.click(); await expect(left).toHaveAttribute('aria-pressed', 'false');
    await cell(page, 0, 2).focus(); await page.keyboard.press('Shift+ArrowLeft');
    await expect(left).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Open all left/right', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(left).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Row 2 warp, left', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('standard');
    await expect(cell(page, 0, 0)).toHaveAttribute('aria-label', 'Cell 0,0 Color 1');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(cell(page, 0, 0)).toHaveAttribute('aria-label', 'Cell 0,0 Empty');
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('warps');
    await page.getByRole('button', { name: 'Warps', exact: true }).click();
    await expect(left).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await state(page))?.warps?.length).toBe(1);
    await page.reload(); await openBoardOptions(page);
    await page.getByRole('button', { name: 'Warps', exact: true }).click();
    await expect(left).toHaveAttribute('aria-pressed', 'true');
});

test('horizontal bridge conflicts, removal, Undo and reset/resize cancellation are reversible', async ({ page }) => {
    await page.goto('./'); await openBoardOptions(page);
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('bridges');
    await cell(page, 1, 1).click();
    await page.getByRole('button', { name: 'Bridges', exact: true }).click();
    await cell(page, 1, 1).click(); await expect(page.getByRole('status')).toContainText('Remove this dot');
    await cell(page, 2, 2).focus(); await page.keyboard.press('Enter');
    await expect(page.locator('[data-bridge="2,2"]')).toHaveCount(1);
    await cell(page, 2, 2).click();
    await expect(page.locator('[data-bridge]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(cell(page, 2, 2)).toHaveAttribute('aria-label', /horizontal on top/);
    await page.getByRole('button', { name: 'Walls', exact: true }).click();
    await cell(page, 2, 2).focus(); await page.keyboard.press('Shift+ArrowRight');
    await expect(page.getByRole('status')).toContainText('four sides');
    await expect(page.locator('[data-wall]')).toHaveCount(0);
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('6');
    await expect(page.getByRole('combobox', { name: 'Grid Size' })).toHaveValue('5');
    await expect(page.locator('[data-bridge]')).toHaveCount(1);
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.locator('[data-bridge]')).toHaveCount(1);
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.locator('[data-bridge]')).toHaveCount(0);
});

test('variant solver worker refuses unsupported algorithms', async ({ page }) => {
    await page.addInitScript(() => {
        const Original = Worker;
        window.Worker = class extends Original {
            postMessage(message: any) { super.postMessage({ ...message, mode: 'warps', type: 'astar' }); }
        };
    });
    await page.goto('./'); await cell(page, 0, 0).click(); await cell(page, 4, 0).click();
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('requires the C/Wasm solver');
});

test('mobile bridge editing and warp targets work with touch without page overflow', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto('./'); await openBoardOptions(page);
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('bridges');
    await page.getByRole('button', { name: 'Bridges', exact: true }).tap();
    await cell(page, 2, 2).tap(); await expect(page.locator('[data-bridge]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Zoom in|Fit board|Pan board/ })).toHaveCount(0);
    await cell(page, 1, 1).tap(); await expect(page.locator('[data-bridge]')).toHaveCount(2);
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('warps');
    await page.getByRole('button', { name: 'Warps', exact: true }).tap();
    await page.getByRole('button', { name: 'Row 3 warp, right', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Row 3 warp, left', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('mobile-variant.png'), fullPage: true });
    await context.close();
});

test('Cancel preserves a variant puzzle and a fresh worker can solve it', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/solver\.worker/, async route => {
        await gate; await route.continue().catch(() => {});
    });
    try {
        const fixture = bridgeCross();
        await page.goto('./'); await recreate(page, fixture);
        const request = page.waitForRequest(/solver\.worker/);
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await request;
        await expect(page.getByRole('status')).toContainText('Solving');
        await expect(page.locator('.working-dots span')).toHaveCount(3);
        await expect(page.locator('.working-dots span').first()).toHaveCSS('animation-duration', '1.2s');
        await page.screenshot({ path: test.info().outputPath('solving-state.png'), fullPage: true });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        expect(await page.locator('.working-dots span').first().evaluate(element => parseFloat(getComputedStyle(element).animationDuration))).toBeLessThan(.001);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeEnabled();
        await expect(page.locator('[data-bridge]')).toHaveCount(1);
        release(); await page.unroute(/solver\.worker/);
        await solveAndValidate(page, fixture);
    } finally { release(); }
});

test('legacy Warps placeholder preserves its old puzzle as the Standard draft', async ({ page }) => {
    await page.goto('./');
    await expect(cell(page, 0, 0)).toBeEnabled();
    await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('flow-solver-db'); r.onsuccess = () => resolve(r.result); });
        const board = Array.from({ length: 5 }, () => Array(5).fill(0)); board[0][0] = board[4][0] = 1;
        await new Promise<void>(resolve => {
            const tx = db.transaction('puzzle-state', 'readwrite');
            tx.objectStore('puzzle-state').put({ size: 5, mode: 'warps', board, solverType: 'astar', activeColor: 2, isPlacingSecond: false, savedAt: Date.now() }, 'current');
            tx.oncomplete = () => resolve();
        }); db.close();
    });
    await page.reload(); await openBoardOptions(page);
    await expect(page.getByRole('combobox', { name: 'Game Mode' })).toHaveValue('warps');
    await expect(page.getByRole('combobox', { name: 'Solver Algorithm' })).toHaveCount(0);
    await expect(page.locator('.endpoint-dot')).toHaveCount(0);
    await page.getByRole('button', { name: 'Warps', exact: true }).click();
    await page.getByRole('button', { name: 'Row 3 warp, left', exact: true }).click();
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('standard');
    await expect(page.locator('.endpoint-dot')).toHaveCount(2);
    await expect(cell(page, 4, 0)).toHaveAttribute('aria-label', 'Cell 4,0 Color 1');
});

test.beforeEach(async ({ page }) => { await optIntoGenerator(page); });
