import { test, expect, type Page } from '@playwright/test';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { wallCorridor, wallDetour } from '../fixtures/wall-puzzles.mjs';
import { openBoardOptions, selectWallTool } from './board-options';

const colors = '.RBYGOCMmPAWgTbcp';
type Wall = { x: number; y: number; side: 'right' | 'down' };
const grid = (page: Page) => page.getByRole('article', { name: 'Puzzle Grid Board' });
const cell = (page: Page, x: number, y: number) => grid(page).getByRole('button', { name: new RegExp(`^Cell ${x},${y} `) });

async function place(page: Page, input: string) {
    const rows = input.trim().split('\n');
    for (const color of colors.slice(1)) {
        for (let y = 0; y < rows.length; y++) {
            for (let x = 0; x < rows[y].length; x++) {
                if (rows[y][x] === color) await cell(page, x, y).click();
            }
        }
    }
}

async function drawWithKeyboard(page: Page, walls: Wall[]) {
    await selectWallTool(page);
    for (const { x, y, side } of walls) {
        await cell(page, x, y).focus();
        await page.keyboard.press(side === 'right' ? 'Shift+ArrowRight' : 'Shift+ArrowDown');
    }
    await expect(page.locator('[data-wall]')).toHaveCount(walls.length);
}

async function saved(page: Page) {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = indexedDB.open('flow-solver-db');
            request.onsuccess = () => resolve(request.result);
        });
        const state = await new Promise<{ walls?: Wall[]; generatedSolution?: number[][] | null; activeColor: number }>(resolve => {
            const request = db.transaction('puzzle-state').objectStore('puzzle-state').get('current');
            request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return state;
    });
}

async function validate(page: Page, input: string, walls: Wall[]) {
    const rows = input.trim().split('\n');
    const values = await grid(page).getByRole('button').evaluateAll(buttons =>
        buttons.map(button => Number(button.getAttribute('aria-label')!.split('Color ')[1]) || 0));
    assertSolution(input, rows.map((row, y) => Array.from(row, (_, x) => colors.charCodeAt(values[y * row.length + x]))), walls);
}

for (const [width, height] of [[5, 5], [5, 8], [8, 5]]) {
    test(`wall editor saves and solves ${width}x${height} through real C/Wasm workers`, async ({ page }) => {
        const fixture = wallCorridor(width, height);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('./');
        await openBoardOptions(page);
        await page.getByRole('combobox', { name: 'Grid Width' }).selectOption(String(width));
        await page.getByRole('combobox', { name: 'Grid Height' }).selectOption(String(height));
        await openBoardOptions(page);
        if (width === height) await page.getByRole('combobox', { name: 'Solver Algorithm' }).selectOption('astar');
        await place(page, fixture.input);
        await drawWithKeyboard(page, fixture.walls);
        await expect(page.getByRole('combobox', { name: 'Solver Algorithm' })).toHaveValue('heuristic_bfs');
        await expect(page.getByRole('combobox', { name: 'Solver Algorithm' })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled();
        await expect.poll(async () => (await saved(page))?.walls?.length).toBe(fixture.walls.length);
        await page.reload();
        await expect(page.locator('[data-wall]')).toHaveCount(fixture.walls.length);
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved');
        await validate(page, fixture.input, fixture.walls);
        // SVG line geometry has zero height/width; check the visible overlay and painted stroke.
        await expect(page.locator('.wall-overlay')).toBeVisible();
        await expect(page.locator('[data-wall]').first()).toHaveCSS('stroke', 'rgb(238, 233, 216)');
        if (width === 5 && height === 5) await page.screenshot({ path: test.info().outputPath('walls-solved.png') });
        await expect(cell(page, 0, 0)).toBeDisabled();
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        await selectWallTool(page);
        await cell(page, 0, 0).focus();
        await page.keyboard.press('Shift+ArrowRight');
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('No solution');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved');
        await validate(page, fixture.input, fixture.walls);
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await expect(page.locator('[data-wall]')).toHaveCount(0);
        await expect(grid(page).getByRole('button', { name: /Empty$/ })).toHaveCount(width * height);
        expect(errors).toEqual([]);
    });
}

test('walls between adjacent endpoints force a multi-color detour', async ({ page }) => {
    await page.goto('./');
    await place(page, wallDetour.input);
    await drawWithKeyboard(page, wallDetour.walls);
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solved');
    await validate(page, wallDetour.input, wallDetour.walls);
});

test('pointer strokes add/remove once per edge, with undo and center/outer-border protection', async ({ page }) => {
    await page.goto('./');
    await cell(page, 0, 0).click();
    await selectWallTool(page);
    const bounds = (await grid(page).boundingBox())!;
    const point = (x: number, y: number) => ({ x: bounds.x + bounds.width * x / 5, y: bounds.y + bounds.height * y / 5 });
    const start = point(.5, 1), end = point(3.5, 1);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.move(start.x, start.y, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('[data-wall]')).toHaveCount(4);
    for (let x = 0; x < 4; x++) await expect(page.locator(`[data-wall="${x},0,down"]`)).toHaveCSS('stroke-width', '5px');
    await expect(cell(page, 0, 0)).toHaveAttribute('aria-label', 'Cell 0,0 Color 1');
    await cell(page, 2, 2).click();
    const outside = point(0, 2.5);
    await page.mouse.click(outside.x, outside.y);
    await expect(page.locator('[data-wall]')).toHaveCount(4);
    await expect(grid(page).getByRole('button', { name: /Color/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('[data-wall]')).toHaveCount(0);
    // A removing stroke stays a removal even when revisiting its first edge.
    await page.mouse.click(start.x, start.y);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.move(start.x, start.y, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('[data-wall]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('[data-wall]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear walls', exact: true }).click();
    await expect(page.locator('[data-wall]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('[data-wall]')).toHaveCount(1);
    await cell(page, 0, 0).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(cell(page, 0, 0)).toBeFocused();
    await expect(cell(page, 0, 0)).toHaveAttribute('aria-label', 'Cell 0,0 Color 1');
    await expect(page.locator('[data-wall]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Walls', exact: true }).click();
    await cell(page, 1, 0).click();
    await expect(cell(page, 1, 0)).toHaveAttribute('aria-label', 'Cell 1,0 Color 1');
    await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('6');
    await expect(page.locator('[data-wall]')).toHaveCount(0);
});

test('wall edits invalidate generated solutions and remain invalidated after undo/reload', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Generated');
    await expect.poll(async () => !!(await saved(page))?.generatedSolution).toBe(true);
    await drawWithKeyboard(page, [{ x: 0, y: 0, side: 'right' }]);
    await expect.poll(async () => (await saved(page))?.generatedSolution).toBeNull();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await saved(page))?.walls?.length).toBe(0);
    await page.reload();
    await expect(page.getByRole('status')).not.toContainText('Generated');
    expect((await saved(page))?.generatedSolution).toBeNull();
});

for (const requested of ['astar', 'z3', 'malformed']) {
    test(`real solver worker rejects ${requested} wall requests instead of ignoring walls`, async ({ page }) => {
        await page.addInitScript(requested => {
            const Base = window.Worker;
            window.Worker = class extends Base {
                postMessage(message: { type?: string; walls?: unknown[] }, transfer: Transferable[] = []) {
                    super.postMessage(message.walls?.length
                        ? requested === 'malformed' ? { ...message, walls: [{ x: 999, y: 0, side: 'right' }] }
                            : { ...message, type: requested }
                        : message, transfer);
                }
            };
        }, requested);
        const fixture = wallCorridor();
        await page.goto('./');
        await place(page, fixture.input);
        await drawWithKeyboard(page, fixture.walls);
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText(requested === 'malformed' ? 'Invalid wall boundary' : 'Boards with walls require the C/Wasm solver');
        await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    });
}

test('cancelled pointer strokes leave walls and history unchanged', async ({ page }) => {
    await page.goto('./');
    await selectWallTool(page);
    const bounds = (await grid(page).boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 5, bounds.y + bounds.height / 10);
    await page.mouse.down();
    await expect(page.locator('[data-wall]')).toHaveCount(1); // Local preview only.
    await grid(page).dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up();
    await expect(page.locator('[data-wall]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('invalid saved walls pause editing and autosave until an explicit Reset', async ({ page }) => {
    await page.goto('./');
    await expect.poll(async () => (await saved(page))?.walls).toEqual([]);
    await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = indexedDB.open('flow-solver-db');
            request.onsuccess = () => resolve(request.result);
        });
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('puzzle-state', 'readwrite');
            const store = tx.objectStore('puzzle-state');
            const request = store.get('current');
            request.onsuccess = () => store.put({ ...request.result, walls: [{ x: 999, y: 0, side: 'right' }] }, 'current');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    });
    await page.reload();
    await expect(page.getByRole('status')).toContainText('Saved walls are invalid');
    await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeDisabled();
    await expect(cell(page, 0, 0)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeEnabled();
    // Cross the autosave debounce, then confirm the invalid record was not overwritten.
    await page.waitForTimeout(650);
    expect((await saved(page))?.walls?.[0].x).toBe(999);
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Saved walls are invalid');
    expect((await saved(page))?.walls?.[0].x).toBe(999);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(cell(page, 0, 0)).toBeEnabled();
    await expect.poll(async () => (await saved(page))?.walls).toEqual([]);
});

test('real generator worker rejects a wall layout even when directly requested', async ({ page }) => {
    await page.addInitScript(() => {
        const Base = window.Worker;
        window.Worker = class extends Base {
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                (window as unknown as { lastWorkerUrl: string }).lastWorkerUrl = String(url);
            }
        };
    });
    await page.goto('./');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Generated');
    const error = await page.evaluate(() => new Promise<string>((resolve, reject) => {
        const worker = new Worker((window as unknown as { lastWorkerUrl: string }).lastWorkerUrl, { type: 'module' });
        worker.onmessage = event => { worker.terminate(); resolve(event.data.error); };
        worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
        worker.postMessage({ width: 5, height: 5, seed: 42, mode: 'standard', walls: [{ x: 0, y: 0, side: 'right' }] });
    }));
    expect(error).toBe('Clear walls to generate a puzzle');
});

test.describe('mobile wall editing', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
    test('touch toggles walls and zoom offers large targets without page overflow', async ({ page }) => {
        await page.goto('./');
        await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('15');
        await selectWallTool(page);
        await page.getByRole('button', { name: 'Zoom in', exact: true }).tap();
        await grid(page).scrollIntoViewIfNeeded();
        const bounds = (await grid(page).boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(720);
        await page.touchscreen.tap(bounds.x + 48, bounds.y + 24);
        await expect(page.locator('[data-wall="0,0,right"]')).toHaveCount(1);
        await page.touchscreen.tap(bounds.x + 48, bounds.y + 24);
        await expect(page.locator('[data-wall]')).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        // A native touch swipe starting at a cell center pans instead of drawing.
        const session = await page.context().newCDPSession(page);
        try {
            await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + 264, y: bounds.y + 24 }] });
            for (let step = 1; step <= 8; step++) {
                await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + 264 - step * 24, y: bounds.y + 24 }] });
            }
            await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } finally { await session.detach(); }
        await expect.poll(() => page.locator('.board-viewport').evaluate(element => element.scrollLeft)).toBeGreaterThan(70);
        await expect(page.locator('[data-wall]')).toHaveCount(0);
        // Scroll within the viewport to expose the final column's boundary.
        await page.locator('.board-viewport').evaluate(element => { element.scrollLeft = element.scrollWidth; });
        const moved = (await grid(page).boundingBox())!;
        await page.touchscreen.tap(moved.x + 14 * 48, moved.y + 24);
        await expect(page.locator('[data-wall="13,0,right"]')).toHaveCount(1);
        await page.getByRole('button', { name: 'Fit board', exact: true }).tap();
        expect((await grid(page).boundingBox())!.width).toBeLessThanOrEqual(390);
        await page.screenshot({ path: test.info().outputPath('walls-mobile.png'), fullPage: true });
    });
});
