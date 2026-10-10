import { expect, test, type Page } from '@playwright/test';
import { openBoardOptions, selectWallTool } from './board-options';
import { input, walls as limitWalls } from '../fixtures/search-limit-puzzle.mjs';
import { maskedWarpLimit } from '../fixtures/masked-warp-limit.mjs';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { wallCorridor } from '../fixtures/wall-puzzles.mjs';
import { generateRectangularPuzzle } from '../../src/solver/logic/puzzle-generator';
import type { Board } from '../../src/solver/logic/astar-solver';
import type { Wall } from '../../src/solver/logic/walls';

const chars = '.RBYGOCMmPAWgTbcp';
const order = [1, 4, 2, 3, 5, 6, 7, 8, 9, 11, 10, 12, 13, 14, 15, 16];
const columnBoard = (text: string): Board => {
    const rows = text.trim().split('\n');
    return Array.from({ length: rows[0].length }, (_, x) => rows.map(row => chars.indexOf(row[x])));
};
const textBoard = (board: Board) => Array.from({ length: board[0].length }, (_, y) => board.map(column => chars[column[y]]).join('')).join('\n');
const asciiRows = (board: Board) => Array.from({ length: board[0].length }, (_, y) => board.map(column => chars.charCodeAt(column[y])));

test('revalidated Z3 worker scripts retain cross-origin isolation headers', async ({ request }) => {
    const response = await request.get('./wasm/z3-built.js');
    expect(response.status()).toBe(200);
    const etag = response.headers().etag;
    expect(etag).toBeTruthy();
    const cached = await request.get('./wasm/z3-built.js', { headers: { 'If-None-Match': etag } });
    expect(cached.status()).toBe(304);
    expect(cached.headers()['cross-origin-embedder-policy']).toBe('require-corp');
    expect(cached.headers()['cross-origin-opener-policy']).toBe('same-origin');
});

async function placeScreenshot(page: Page, withWall = true) {
    await page.goto('./'); await openBoardOptions(page);
    await page.getByRole('combobox', { name: 'Grid Width' }).selectOption('15');
    await page.getByRole('combobox', { name: 'Grid Height' }).selectOption('18');
    const board = columnBoard(input);
    for (const color of order) for (let y = 0; y < 18; y++) for (let x = 0; x < 15; x++) {
        if (board[x][y] === color) await page.locator(`[data-cell="${x},${y}"]`).click();
    }
    await page.getByRole('switch', { name: 'Color label', exact: true }).check();
    await page.getByRole('switch', { name: 'Board guides', exact: true }).check();
    await expect(page.locator('.endpoint-dot')).toHaveCount(22);
    if (withWall) {
        await selectWallTool(page);
        await page.locator('[data-cell="0,1"]').focus();
        await page.keyboard.press('Shift+ArrowDown');
        await expect(page.locator('[data-wall]')).toHaveCount(1);
        await page.getByRole('button', { name: 'Dots', exact: true }).click();
    }
}

async function validateScreenshot(page: Page, walls: Wall[] = limitWalls) {
    await expect(page.getByRole('status')).toContainText('Solved', { timeout: 45_000 });
    const values = await page.locator('[data-cell]').evaluateAll(cells => cells.map(cell => Number(cell.getAttribute('aria-label')?.split('Color ')[1]) || 0));
    assertSolution(input, Array.from({ length: 18 }, (_, y) => values.slice(y * 15, (y + 1) * 15).map(color => chars.charCodeAt(color))), walls);
    await expect(page.locator('.endpoint-dot')).toHaveCount(22);
    await expect(page.getByRole('status')).not.toContainText('Solver error');
}

const nativeLimit = maskedWarpLimit();
const usedColors = [...new Set(nativeLimit.board.flat())].filter(Boolean).sort((a, b) => a - b);
const colorMap = new Map(usedColors.map((color, i) => [color, order[i]]));
const editorLimit = { ...nativeLimit,
    board: nativeLimit.board.map(col => col.map(color => color ? colorMap.get(color)! : 0)),
};
const limitEndpoints = usedColors.length * 2;

async function placeLimitPuzzle(page: Page) {
    await page.goto('./'); await openBoardOptions(page);
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('warps');
    await page.getByRole('combobox', { name: 'Grid Width' }).selectOption('19');
    await page.getByRole('combobox', { name: 'Grid Height' }).selectOption('19');
    await page.getByRole('button', { name: 'Blocks', exact: true }).click();
    for (const { x, y } of editorLimit.topology.blocks!) await page.locator(`[data-cell="${x},${y}"]`).click();
    await page.getByRole('button', { name: 'Dots', exact: true }).click();
    for (const color of order) for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) {
        if (editorLimit.board[x][y] === color) await page.locator(`[data-cell="${x},${y}"]`).click();
    }
    await selectWallTool(page);
    for (const wall of editorLimit.topology.walls) {
        await page.locator(`[data-cell="${wall.x},${wall.y}"]`).focus();
        await page.keyboard.press(wall.side === 'right' ? 'Shift+ArrowRight' : 'Shift+ArrowDown');
    }
    await page.getByRole('button', { name: 'Warps', exact: true }).click();
    // Keyboard activation also reaches packed corner seams at phone widths.
    for (const seam of editorLimit.topology.warps) await page.getByRole('button', {
        name: `${seam.axis === 'horizontal' ? 'Row' : 'Column'} ${seam.index + 1} warp, ${seam.axis === 'horizontal' ? 'left' : 'top'}`, exact: true,
    }).press('Enter');
    await page.getByRole('button', { name: 'Dots', exact: true }).click();
    await expect(page.locator('.endpoint-dot')).toHaveCount(limitEndpoints);
    await expect(page.locator('[data-blocked]')).toHaveCount(editorLimit.topology.blocks!.length);
}

async function validateFreshSolve(page: Page) {
    // Recovery should exercise a fresh real Z3 worker without depending on
    // this dense puzzle finishing within its search budget on a busy runner.
    // The separate screenshot regression verifies its full solution.
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.locator('.endpoint-dot')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Grid Width' }).selectOption('5');
    await page.getByRole('combobox', { name: 'Grid Height' }).selectOption('5');
    await page.getByRole('combobox', { name: 'Solver Algorithm', exact: true }).selectOption('z3');
    const recovery = generateRectangularPuzzle(5, 5, 42).board;
    for (const color of order) for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        if (recovery[x][y] === color) await page.locator(`[data-cell="${x},${y}"]`).click();
    }
    const loadingAgain = page.waitForRequest(/\/wasm\/z3-built\.wasm/);
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await loadingAgain;
    await expect(page.getByRole('status')).toContainText('Solved', { timeout: 15_000 });
    const values = await page.locator('[data-cell]').evaluateAll(cells => cells.map(cell => Number(cell.getAttribute('aria-label')?.split('Color ')[1]) || 0));
    assertSolution(textBoard(recovery), Array.from({ length: 5 }, (_, y) => values.slice(y * 5, (y + 1) * 5).map(color => chars.charCodeAt(color))));
}

test('the open screenshot solves in the real C worker without SAT fallback', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    await placeScreenshot(page, false);
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await validateScreenshot(page, []);
    expect(requests.some(url => url.includes('flow_solver_c.wasm'))).toBe(true);
    expect(requests.some(url => url.includes('z3-built.wasm'))).toBe(false);
});

test('the screenshot with a wall solves directly in C without SAT fallback', async ({ page }) => {
    const requests: string[] = [], errors: string[] = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    await placeScreenshot(page);
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await validateScreenshot(page);
    await expect(page.getByRole('status')).not.toContainText('SAT');
    expect(requests.some(url => url.includes('flow_solver_c.wasm'))).toBe(true);
    expect(requests.some(url => url.includes('z3-built.wasm'))).toBe(false);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('screenshot-puzzle-solved.png'), fullPage: true });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('.endpoint-dot')).toHaveCount(22);
});

test('a search limit preserves the board and permits a fresh solve', async ({ page }) => {
    await page.addInitScript(() => {
        (window as unknown as { blockFallback: boolean }).blockFallback = true;
        const Base = Worker;
        window.Worker = class extends Base {
            postMessage(message: object, transfer: Transferable[] = []) {
                super.postMessage((window as unknown as { blockFallback: boolean }).blockFallback
                    ? { ...message, allowFallback: false } : message, transfer);
            }
        };
    });
    await placeLimitPuzzle(page);
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Search limit reached. Your puzzle is preserved.', { timeout: 15_000 });
    await expect(page.getByRole('status')).not.toContainText('No solution');
    await expect(page.getByRole('status').getByText('SAT', { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-cell="2,2"]')).toBeEnabled();
    await expect(page.locator('.endpoint-dot')).toHaveCount(limitEndpoints);
    await expect(page.locator('[data-blocked]')).toHaveCount(editorLimit.topology.blocks!.length);
    await expect(page.locator('[data-wall]')).toHaveCount(editorLimit.topology.walls.length);
    await page.evaluate(() => { (window as unknown as { blockFallback: boolean }).blockFallback = false; });
    await validateFreshSolve(page);
});

test('Cancel during automatic SAT loading preserves endpoints and permits a fresh solve', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/\/wasm\/z3-built\.wasm/, async route => {
        await gate; await route.continue().catch(() => {});
    });
    try {
        await placeLimitPuzzle(page);
        const loading = page.waitForRequest(/\/wasm\/z3-built\.wasm/, { timeout: 20_000 });
        await page.getByRole('button', { name: 'Solve', exact: true }).click(); await loading;
        await expect(page.getByRole('status')).toContainText('Solving with SAT');
        await expect(page.getByRole('status').getByText('SAT', { exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeEnabled();
        await expect(page.getByRole('status').getByText('SAT', { exact: true })).toHaveCount(0);
        await expect(page.locator('.endpoint-dot')).toHaveCount(limitEndpoints);
        await expect(page.locator('[data-blocked]')).toHaveCount(editorLimit.topology.blocks!.length);
        await expect(page.locator('[data-wall]')).toHaveCount(editorLimit.topology.walls.length);
        release(); await page.unroute(/\/wasm\/z3-built\.wasm/);

        await validateFreshSolve(page);
    } finally { release(); }
});

async function workerUrl(page: Page) {
    await page.addInitScript(() => {
        const Base = Worker;
        window.Worker = class extends Base {
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options); (window as unknown as { solverWorkerUrl: string }).solverWorkerUrl = String(url);
            }
        };
    });
    await page.goto('./');
    await page.locator('[data-cell="0,0"]').click(); await page.locator('[data-cell="4,0"]').click();
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('No solution');
    return page.evaluate(() => (window as unknown as { solverWorkerUrl: string }).solverWorkerUrl);
}

async function satRequest(page: Page, url: string, board: Board, walls: Wall[] = []) {
    return page.evaluate(({ url, board, walls }) => new Promise<{ status: string; board: Board | null; error?: string }>((resolve, reject) => {
        const worker = new Worker(url, { type: 'module' });
        worker.onmessage = event => { worker.terminate(); resolve(event.data); };
        worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
        worker.postMessage({ board, walls, type: 'z3', mode: 'standard' });
    }), { url, board, walls });
}

test('repeated SAT runs use fresh pthread script URLs and preserve valid solutions', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', request => {
        if (request.url().includes('/wasm/z3-built.js')) scripts.push(request.url());
    });
    const url = await workerUrl(page), puzzle = generateRectangularPuzzle(5, 5, 42);
    for (let run = 0; run < 3; run++) {
        const result = await satRequest(page, url, puzzle.board);
        expect(result.status).toBe('solved');
        assertSolution(textBoard(puzzle.board), asciiRows(result.board!));
    }
    expect(scripts.length).toBeGreaterThanOrEqual(3);
    expect(new Set(scripts).size).toBe(3);
    for (const script of scripts) expect(new URL(script).searchParams.get('worker')).toBeTruthy();
});

test('SAT excludes disconnected degree-valid cycles instead of displaying an invalid solution', async ({ page }) => {
    const url = await workerUrl(page);
    const result = await satRequest(page, url, columnBoard('R..R\n....\n....\nB..B\n'));
    expect(result.status).toBe('unsatisfiable'); expect(result.board).toBeNull(); expect(result.error).toBeUndefined();
    const isolated = await satRequest(page, url, columnBoard('RR\nBB\n'), [
        { x: 0, y: 0, side: 'right' }, { x: 0, y: 1, side: 'right' },
        { x: 0, y: 0, side: 'down' }, { x: 1, y: 0, side: 'down' },
    ]);
    expect(isolated.status).toBe('unsatisfiable'); expect(isolated.error).toBeUndefined();
});

test('real SAT workers solve square, rectangular and boundary puzzles for multiple seeds', async ({ page }) => {
    const url = await workerUrl(page);
    for (const [width, height] of [[5, 5], [5, 8], [8, 5], [19, 5], [5, 19]]) for (const seed of [0, 1, 42]) {
        const puzzle = generateRectangularPuzzle(width, height, seed);
        const result = await satRequest(page, url, puzzle.board);
        expect(result.status, `${width}x${height} seed ${seed}: ${result.error ?? result.status}`).toBe('solved');
        assertSolution(textBoard(puzzle.board), asciiRows(result.board!));
    }
});

test('real SAT workers preserve walls, including a 361-cell forced route', async ({ page }) => {
    const url = await workerUrl(page);
    for (const [width, height] of [[5, 8], [8, 5], [19, 19]]) {
        const fixture = wallCorridor(width, height);
        const result = await satRequest(page, url, columnBoard(fixture.input), fixture.walls);
        expect(result.status).toBe('solved');
        assertSolution(fixture.input, asciiRows(result.board!), fixture.walls);
    }
});
