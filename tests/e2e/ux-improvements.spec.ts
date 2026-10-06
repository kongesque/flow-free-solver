import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openBoardOptions, resizeBoard, selectWallTool } from './board-options';
import { COLORS, COLOR_INK } from '../../src/solver/components/constants';
import { assertSolution } from '../fixtures/assert-solution.mjs';

const cell = (page: Page, x: number, y: number) => page.getByRole('button', { name: new RegExp(`^Cell ${x},${y} `) });
const labels = (page: Page) => page.locator('.puzzle-grid button').evaluateAll(cells => cells.map(cell => cell.getAttribute('aria-label')));
const undo = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true });
const documentBounds = (locator: Locator) => locator.evaluate(element => {
    const r = element.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
});

async function saved(page: Page) {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = indexedDB.open('flow-solver-db');
            request.onsuccess = () => resolve(request.result);
        });
        const state = await new Promise<{ board: number[][]; walls: unknown[]; width: number; height: number; activeColor: number; generatedSolution: number[][] | null }>(resolve => {
            const request = db.transaction('puzzle-state').objectStore('puzzle-state').get('current');
            request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return state;
    });
}

for (const width of [390, 1280]) {
    test(`resize Cancel preserves endpoints, walls, color and Undo at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('./');
        await cell(page, 0, 0).click();
        await selectWallTool(page);
        await cell(page, 1, 1).focus();
        await page.keyboard.press('Shift+ArrowRight');
        await expect.poll(async () => (await saved(page))?.walls.length).toBe(1);
        const before = await saved(page);
        const original = await labels(page);
        for (const name of ['Grid Size', 'Grid Width', 'Grid Height']) {
            page.once('dialog', dialog => {
                expect(dialog.message()).toContain('Resize this puzzle?');
                return dialog.dismiss();
            });
            await page.getByRole('combobox', { name }).selectOption('6');
            await expect(page.getByRole('combobox', { name })).toHaveValue('5');
            expect(await labels(page)).toEqual(original);
            expect(await saved(page)).toEqual(before);
            await expect(undo(page)).toBeEnabled();
        }
        // Selecting the current dimensions cannot reset work or prompt.
        let dialogs = 0;
        const dismiss = () => { dialogs++; };
        page.on('dialog', dismiss);
        await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('5');
        page.off('dialog', dismiss);
        expect(dialogs).toBe(0);
        await page.getByRole('button', { name: 'Place dots', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Place matching dot');
        await undo(page).click();
        await expect(page.locator('[data-wall]')).toHaveCount(0);
        await undo(page).click();
        await expect(cell(page, 0, 0)).toHaveAttribute('aria-label', 'Cell 0,0 Empty');
        await cell(page, 0, 0).click();
        await resizeBoard(page, 'Grid Width', '6');
        await expect(page.locator('.puzzle-grid button')).toHaveCount(30);
        await expect(undo(page)).toBeDisabled();
    });
}

test('resize Cancel preserves a solved generated puzzle and its retained solution', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Generated');
    await expect.poll(async () => !!(await saved(page))?.generatedSolution).toBe(true);
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solved');
    const before = await labels(page), state = await saved(page);
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('8');
    expect(await labels(page)).toEqual(before);
    expect(await saved(page)).toEqual(state);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
    await openBoardOptions(page);
    await expect(page.getByText(/^Solved in /)).toBeVisible();
    await expect(page.getByRole('status')).not.toContainText('ms');
});

test('numbered pairs and named guidance remain consistent through a real solve', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('status')).toContainText('Red, pair 1. Place first dot');
    await expect(page.getByRole('status')).toContainText('Tap a cell. Tap again to remove.');
    await expect(page.locator('.solver-header p')).toHaveCount(0);
    const input = readFileSync(new URL('../fixtures/puzzles/regular_5x5_01.txt', import.meta.url), 'utf8');
    const colors = '.RBYGOCMmPAWgTbcp';
    for (let color = 1; color <= 5; color++) {
        for (const [y, row] of input.trim().split('\n').entries()) {
            for (let x = 0; x < 5; x++) if (row[x] === colors[color]) await cell(page, x, y).click();
        }
    }
    await expect(page.locator('.endpoint-dot')).toHaveCount(10);
    for (const endpoint of await page.getByRole('button', { name: /Cell .* Color/ }).all()) {
        const color = Number((await endpoint.getAttribute('aria-label'))!.split('Color ')[1]);
        await expect(endpoint.locator('.endpoint-dot')).toHaveText(String(color));
        await expect(endpoint).toHaveAccessibleDescription(new RegExp(`pair ${color}`));
    }
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solved');
    const solution = (await labels(page)).map(label => Number(label!.split('Color ')[1]));
    assertSolution(input, Array.from({ length: 5 }, (_, y) => solution.slice(y * 5, y * 5 + 5).map(color => colors.charCodeAt(color))));
    expect(await page.locator('.endpoint-dot').evaluateAll(dots => dots.filter(dot => dot.textContent).length)).toBe(10);
});

test('pair colors separate from the board and their number text remains readable', () => {
    const luminance = (hex: string) => {
        const full = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
        const values = full.slice(1).match(/../g)!.map(c => parseInt(c, 16) / 255)
            .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
        return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
    };
    const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    for (const [id, color] of Object.entries(COLORS)) {
        expect(contrast(color, '#1C1F1E'), `pair ${id} against board`).toBeGreaterThanOrEqual(3);
        expect(contrast(color, COLOR_INK[Number(id)]), `pair ${id} number`).toBeGreaterThanOrEqual(4.5);
    }
});

test('wall mode has a direct exit with options closed and explains fixed algorithms', async ({ page }) => {
    await page.goto('./');
    await cell(page, 0, 0).click();
    await selectWallTool(page);
    await cell(page, 1, 1).focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.getByRole('combobox', { name: 'Solver Algorithm' })).toHaveAccessibleDescription('Wall boards use Heuristic BFS.');
    await expect(page.getByRole('combobox', { name: 'Game Mode' })).toHaveCount(0);
    await page.locator('.board-options summary').click();
    const frame = await documentBounds(page.getByRole('region', { name: 'Puzzle editor' }));
    const primary = await documentBounds(page.locator('.primary-action'));
    await page.getByRole('button', { name: 'Place dots', exact: true }).click();
    expect(await documentBounds(page.getByRole('region', { name: 'Puzzle editor' }))).toEqual(frame);
    expect(await documentBounds(page.locator('.primary-action'))).toEqual(primary);
    await expect(page.locator('[data-wall]')).toHaveCount(1);
    await cell(page, 4, 0).click();
    await expect(cell(page, 4, 0)).toHaveAttribute('aria-label', 'Cell 4,0 Color 1');
    await undo(page).click();
    await undo(page).click();
    await expect(page.locator('[data-wall]')).toHaveCount(0);
});

test('zoomed dot editing pans with a mouse without placing an endpoint or moving the board frame', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 900 });
    await page.goto('./');
    await resizeBoard(page, 'Grid Size', '15');
    await openBoardOptions(page);
    const editor = page.getByRole('region', { name: 'Puzzle editor' });
    const frame = await documentBounds(editor);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const viewport = page.locator('.board-viewport');
    await viewport.scrollIntoViewIfNeeded();
    const bounds = (await viewport.boundingBox())!;
    await page.mouse.move(bounds.x + 220, bounds.y + 220);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 100, bounds.y + 100, { steps: 12 });
    await page.mouse.up();
    expect(await viewport.evaluate(v => [v.scrollLeft, v.scrollTop])).toEqual([120, 120]);
    await expect(page.locator('.endpoint-dot')).toHaveCount(0);
    await expect(undo(page)).toBeDisabled();
    await cell(page, 5, 5).click();
    await expect(cell(page, 5, 5)).toHaveAttribute('aria-label', 'Cell 5,5 Color 1');
    await page.getByRole('button', { name: 'Fit board', exact: true }).click();
    expect(await documentBounds(editor)).toEqual(frame);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test.describe('precise touch editing', () => {
    test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
    test('native touch panning does not paint dots and a following tap still edits', async ({ page }) => {
        await page.goto('./');
        await resizeBoard(page, 'Grid Size', '15');
        await openBoardOptions(page);
        await page.getByRole('button', { name: 'Zoom in', exact: true }).tap();
        const viewport = page.locator('.board-viewport');
        await viewport.scrollIntoViewIfNeeded();
        await cell(page, 0, 0).tap();
        const bounds = (await viewport.boundingBox())!;
        expect(bounds.height).toBeLessThan(400);
        const before = await labels(page);
        const session = await page.context().newCDPSession(page);
        try {
            await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + 220, y: bounds.y + 220 }] });
            for (let step = 1; step <= 8; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + 220 - step * 15, y: bounds.y + 220 - step * 15 }] });
            await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } finally { await session.detach(); }
        await expect.poll(() => viewport.evaluate(v => v.scrollLeft)).toBeGreaterThan(20);
        expect(await labels(page)).toEqual(before);
        await cell(page, 5, 5).tap();
        await expect(cell(page, 5, 5)).toHaveAttribute('aria-label', 'Cell 5,5 Color 1');
        await undo(page).tap();
        await expect(cell(page, 5, 5)).toHaveAttribute('aria-label', 'Cell 5,5 Empty');
    });
});

for (const operation of ['solve', 'generate'] as const) {
    test(`Cancel stops a real ${operation} worker without clearing the puzzle or Undo`, async ({ page }) => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const resource = operation === 'solve' ? /flow_solver_c\.wasm/ : /generator\.worker/;
        await page.route(resource, async route => { await gate; await route.continue().catch(() => {}); });
        try {
            await page.goto('./');
            const input = readFileSync(new URL('../fixtures/puzzles/regular_5x5_01.txt', import.meta.url), 'utf8');
            const colors = '.RBYGOCMmPAWgTbcp';
            let last: [number, number] = [4, 4];
            if (operation === 'solve') {
                for (let color = 1; color <= 5; color++) for (const [y, row] of input.trim().split('\n').entries()) {
                    for (let x = 0; x < 5; x++) if (row[x] === colors[color]) { await cell(page, x, y).click(); last = [x, y]; }
                }
            } else {
                await cell(page, 0, 0).click();
                await cell(page, 4, 4).click();
            }
            const before = await labels(page);
            const request = page.waitForRequest(resource);
            if (operation === 'generate') page.once('dialog', dialog => dialog.accept());
            await page.getByRole('button', { name: operation === 'solve' ? 'Solve' : 'Generate', exact: true }).click();
            await request;
            await expect(page.getByRole('status')).toContainText(operation === 'solve' ? 'Solving' : 'Generating');
            await page.getByRole('button', { name: 'Cancel', exact: true }).click();
            expect(await labels(page)).toEqual(before);
            await expect(undo(page)).toBeEnabled();
            await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeEnabled();
            await undo(page).click();
            await expect(cell(page, ...last)).toHaveAttribute('aria-label', `Cell ${last[0]},${last[1]} Empty`);
            await cell(page, ...last).click();
            expect(await labels(page)).toEqual(before);
            release();
            if (operation === 'generate') page.once('dialog', dialog => dialog.accept());
            await page.getByRole('button', { name: operation === 'solve' ? 'Solve' : 'Generate', exact: true }).click();
            await expect(page.getByRole('status')).toContainText(operation === 'solve' ? 'Solved' : 'Generated');
            if (operation === 'solve') {
                const solution = (await labels(page)).map(label => Number(label!.split('Color ')[1]));
                assertSolution(input, Array.from({ length: 5 }, (_, y) => solution.slice(y * 5, y * 5 + 5).map(color => colors.charCodeAt(color))));
            }
        } finally { release(); }
    });
}
