import { expect, test, type Page } from '@playwright/test';
import { blockBridge, blockRows, screenshotBlocks, type BlockFixture } from '../fixtures/block-puzzles.mjs';
import { assertInducedTopologySolution, assertTopologySolution } from '../fixtures/assert-topology-solution.mjs';
import { solveSat, solverWorkerUrl } from './z3-test-worker';
import { openBoardOptions } from './board-options';
import type { Board } from '../../src/solver/logic/astar-solver';
import type { PuzzleSolution } from '../../src/solver/logic/solution';

const cell = (page: Page, x: number, y: number) => page.locator(`[data-cell="${x},${y}"]`);
const colors = [1, 4, 2, 3, 5, 6, 7, 8, 9, 11, 10, 12, 13, 14, 15, 16];

async function savedState(page: Page) {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('flow-solver-db'); r.onsuccess = () => resolve(r.result); });
        const state = await new Promise<any>(resolve => { const r = db.transaction('puzzle-state').objectStore('puzzle-state').get('current'); r.onsuccess = () => resolve(r.result); });
        db.close(); return state;
    });
}

async function workerSolve(page: Page, url: string, f: Omit<BlockFixture, 'solution'>, type: 'heuristic_bfs' | 'astar', allowFallback = false) {
    return page.evaluate(({ url, f, type, allowFallback }) => new Promise<{ status: string; board: Board | null; solution: PuzzleSolution | null; error?: string; fallbackUsed: boolean }>((resolve, reject) => {
        const worker = new Worker(url, { type: 'module' });
        worker.onmessage = event => {
            if (event.data.kind === 'progress') return;
            worker.terminate(); resolve(event.data);
        };
        worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
        worker.postMessage({ board: f.board, ...f.topology, mode: f.mode, type, allowFallback });
    }), { url, f, type, allowFallback });
}

for (const mode of ['standard', 'bridges', 'warps'] as const) {
    test(`Blocks: edit, solve, reload and Undo a ${mode} rectangle through real workers`, async ({ page }) => {
        const original = mode === 'bridges' ? blockBridge(8, 5) : blockRows(8, 5, mode);
        const used = colors.filter(color => original.board.some(column => column.includes(color)));
        const mapping = new Map(used.map((color, index) => [color, colors[index]]));
        const f = { ...original, board: original.board.map(column => column.map(c => c ? mapping.get(c)! : 0)) };
        await page.goto('./'); await openBoardOptions(page);
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
        await page.getByRole('combobox', { name: 'Grid Width' }).selectOption('8');
        await page.getByRole('button', { name: 'Blocks', exact: true }).click();
        for (const { x, y } of f.topology.blocks!) await cell(page, x, y).click();
        await expect(page.locator('[data-blocked]')).toHaveCount(f.topology.blocks!.length);
        await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: 'Dots', exact: true }).click();
        for (const originalColor of used) for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) {
            if (original.board[x][y] === originalColor) await cell(page, x, y).click();
        }
        await page.getByRole('button', { name: 'Walls', exact: true }).click();
        for (const wall of f.topology.walls) { await cell(page, wall.x, wall.y).focus(); await page.keyboard.press(wall.side === 'right' ? 'Shift+ArrowRight' : 'Shift+ArrowDown'); }
        if (mode === 'bridges') {
            await page.getByRole('button', { name: 'Bridges', exact: true }).click();
            for (const b of f.topology.bridges) await cell(page, b.x, b.y).click();
        } else if (mode === 'warps') {
            await page.getByRole('button', { name: 'Warps', exact: true }).click();
            for (const s of f.topology.warps) await page.getByRole('button', { name: `Row ${s.index + 1} warp, left`, exact: true }).click();
        }
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved');
        assertTopologySolution(f, JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!));
        await page.screenshot({ path: test.info().outputPath(`blocks-${mode}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Blocks', exact: true }).click();
        const block = f.topology.blocks![0];
        await cell(page, block.x, block.y).click();
        await expect(cell(page, block.x, block.y)).not.toHaveAttribute('data-blocked');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(cell(page, block.x, block.y)).toHaveAccessibleName(`Cell ${block.x},${block.y} Blocked`);
        await expect.poll(async () => (await savedState(page))?.blocks).toEqual(f.topology.blocks);
        await page.reload();
        await expect(page.locator('[data-blocked]')).toHaveCount(f.topology.blocks!.length);
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved');
        assertTopologySolution(f, JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!));
    });
}

test('Blocks: BFS and SAT independently solve masks in every mode and both rectangle orientations', async ({ page }) => {
    test.setTimeout(180_000);
    const url = await solverWorkerUrl(page);
    for (const [width, height] of [[5, 5], [5, 19], [19, 5], [19, 19]]) {
        for (const f of [blockRows(width, height), blockRows(width, height, 'warps'), blockBridge(width, height)]) {
            for (const result of [await workerSolve(page, url, f, 'heuristic_bfs'), await solveSat(page, url, f.board, f.topology, f.mode)]) {
                expect(result.status, `${f.mode} ${width}x${height}: ${result.error ?? result.status}`).toBe('solved');
                assertTopologySolution(f, result.solution!);
                if (f.mode === 'standard') assertInducedTopologySolution(f, result.solution!);
                for (const { x, y } of f.topology.blocks!) expect(result.board![x][y]).toBe(0);
            }
        }
    }
    const f = blockRows();
    const astar = await workerSolve(page, url, f, 'astar');
    expect(astar.status).toBe('solved'); assertInducedTopologySolution(f, astar.solution!);
    for (const f of [blockRows(), blockRows(5, 5, 'warps'), blockBridge()]) {
        const verified = await solveSat(page, url, f.board, f.topology, f.mode, f.solution);
        expect(verified.status).toBe('solved'); assertTopologySolution(f, verified.solution!);
    }
});

test('Blocks: Pruned DFS solves the formerly limited 19x19 mask without SAT', async ({ page }) => {
    const url = await solverWorkerUrl(page), f = blockRows(19, 19, 'standard', 15);
    const solved = await workerSolve(page, url, f, 'heuristic_bfs');
    expect(solved.status, solved.error).toBe('solved'); assertInducedTopologySolution(f, solved.solution!);
    expect(solved.fallbackUsed).toBe(false);
    for (const { x, y } of f.topology.blocks!) expect(solved.board![x][y]).toBe(0);
});

test('Blocks: the screenshot solves with walls; invalid and stranded masks fail visibly', async ({ page }) => {
    const url = await solverWorkerUrl(page), f = screenshotBlocks();
    for (const result of [await workerSolve(page, url, f, 'heuristic_bfs'), await solveSat(page, url, f.board, f.topology, f.mode)]) {
        expect(result.status, result.error).toBe('solved'); assertInducedTopologySolution(f, result.solution!);
    }
    const invalid = { ...blockRows(), topology: { ...blockRows().topology, blocks: [{ x: 1, y: 0 }] } };
    for (const result of [await workerSolve(page, url, invalid, 'heuristic_bfs'), await solveSat(page, url, invalid.board, invalid.topology, 'standard')]) {
        expect(result.status).toBe('error'); expect(result.error).toContain('Remove this dot');
    }
    const board = Array.from({ length: 5 }, () => Array(5).fill(0)); board[0][0] = board[1][0] = 1;
    const blocks = Array.from({ length: 25 }, (_, id) => ({ x: id % 5, y: Math.floor(id / 5) })).filter(n => !(n.y === 0 && n.x < 2 || n.x === 2 && n.y === 2));
    for (const mode of ['standard', 'bridges', 'warps'] as const) {
        const stranded = { width: 5, height: 5, board, input: '', topology: { blocks, walls: [], bridges: [], warps: [] }, mode };
        for (const result of [await workerSolve(page, url, stranded, 'heuristic_bfs'), await solveSat(page, url, board, stranded.topology, mode)]) {
            expect(result.status).toBe('unsatisfiable'); expect(result.board).toBeNull(); expect(result.solution).toBeNull();
        }
    }
});

test('Blocks: keyboard, conflicts, warp closure and separate mode histories are reversible', async ({ page }) => {
    await page.goto('./'); await openBoardOptions(page);
    await cell(page, 1, 0).click();
    await page.getByRole('button', { name: 'Blocks', exact: true }).click();
    await cell(page, 1, 0).click(); await expect(page.getByRole('status')).toContainText('Remove this dot');
    await cell(page, 2, 2).focus(); await page.keyboard.press('Enter');
    await expect(cell(page, 2, 2)).toHaveAccessibleName('Cell 2,2 Blocked');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space');
    await expect(cell(page, 3, 2)).toHaveAttribute('data-blocked', 'true');
    await page.getByRole('button', { name: 'Dots', exact: true }).click(); await cell(page, 2, 2).click();
    await expect(page.getByRole('status')).toContainText('Remove this block');
    await expect(page.locator('.endpoint-dot')).toHaveCount(1);
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('bridges');
    await page.getByRole('button', { name: 'Bridges', exact: true }).click(); await cell(page, 2, 2).click();
    await page.getByRole('button', { name: 'Blocks', exact: true }).click(); await cell(page, 2, 2).click();
    await expect(page.getByRole('status')).toContainText('Remove this bridge');
    await expect(page.locator('[data-blocked]')).toHaveCount(0);
    await cell(page, 2, 1).click(); await expect(page.getByRole('status')).toContainText('four sides');
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('warps');
    await page.getByRole('button', { name: 'Warps', exact: true }).click(); await page.getByRole('button', { name: 'Row 3 warp, left', exact: true }).click();
    await page.getByRole('button', { name: 'Blocks', exact: true }).click(); await cell(page, 0, 2).click();
    await expect(page.locator('[data-warp]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('[data-warp]')).toHaveCount(2);
    await expect(cell(page, 0, 2)).not.toHaveAttribute('data-blocked');
    await cell(page, 0, 2).click();
    await page.getByRole('button', { name: 'Warps', exact: true }).click(); await page.getByRole('button', { name: 'Open all left/right', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Row 3 warp, left', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('standard');
    await expect(page.locator('[data-blocked]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('[data-blocked]')).toHaveCount(1);
    await expect.poll(async () => (await savedState(page))?.drafts.warps.blocks).toEqual([{ x: 0, y: 2 }]);
    await page.reload(); await expect(page.locator('[data-blocked]')).toHaveCount(1);
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('warps'); await expect(cell(page, 0, 2)).toHaveAccessibleName('Cell 0,2 Blocked');
});

test('Blocks: touch editing, removal, reset and resizing preserve the intended mask', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto('./'); await page.getByRole('button', { name: 'Blocks', exact: true }).tap();
    await cell(page, 0, 0).tap(); await expect(cell(page, 0, 0)).toHaveAttribute('data-blocked', 'true');
    await cell(page, 2, 2).tap(); await expect(page.locator('[data-blocked]')).toHaveCount(2);
    await cell(page, 2, 2).tap(); await expect(page.locator('[data-blocked]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Reset', exact: true }).tap();
    await expect(page.locator('[data-blocked]')).toHaveCount(1);
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reset', exact: true }).tap();
    await expect(page.locator('[data-blocked]')).toHaveCount(0);
    await cell(page, 4, 4).tap();
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('6');
    await expect(page.getByRole('combobox', { name: 'Grid Size' })).toHaveValue('5');
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('6');
    await expect(page.locator('[data-blocked]')).toHaveCount(0);
    await expect(page.locator('[data-cell]')).toHaveCount(36);
    await context.close();
});

test('Blocks: generators reject masked requests in every mode without replacing the puzzle', async ({ page }) => {
    await page.addInitScript(() => {
        const Native = Worker;
        window.Worker = class extends Native {
            postMessage(message: any) { super.postMessage({ ...message, blocks: [{ x: 2, y: 2 }] }); }
        };
    });
    await page.goto('./');
    for (const mode of ['standard', 'bridges', 'warps']) {
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Clear blocks');
        await expect(page.locator('.endpoint-dot')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeEnabled();
    }
});

test('Blocks: conflicting saved data requires reset; older saves still load without a mask', async ({ page }) => {
    await page.goto('./'); await expect(cell(page, 0, 0)).toBeEnabled();
    await cell(page, 1, 1).click(); await expect.poll(async () => (await savedState(page))?.board[1][1]).toBe(1);
    await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('flow-solver-db'); r.onsuccess = () => resolve(r.result); });
        await new Promise<void>(resolve => {
            const tx = db.transaction('puzzle-state', 'readwrite'), store = tx.objectStore('puzzle-state');
            const r = store.get('current'); r.onsuccess = () => store.put({ ...r.result, blocks: [{ x: 1, y: 1 }] }, 'current');
            tx.oncomplete = () => resolve();
        }); db.close();
    });
    await page.reload(); await expect(page.getByRole('status')).toContainText('Saved puzzle is invalid');
    await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeDisabled();
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.locator('[data-blocked]')).toHaveCount(0); await expect(cell(page, 0, 0)).toBeEnabled();
    await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('flow-solver-db'); r.onsuccess = () => resolve(r.result); });
        await new Promise<void>(resolve => {
            const tx = db.transaction('puzzle-state', 'readwrite');
            tx.objectStore('puzzle-state').put({ size: 5, board: Array.from({ length: 5 }, () => Array(5).fill(0)),
                solverType: 'heuristic_bfs', activeColor: 1, isPlacingSecond: false, savedAt: Date.now() }, 'current');
            tx.oncomplete = () => resolve();
        }); db.close();
    });
    await page.reload(); await expect(cell(page, 0, 0)).toBeEnabled();
    await expect(page.locator('[data-blocked]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Blocks', exact: true }).click(); await cell(page, 4, 4).click();
    await expect(cell(page, 4, 4)).toHaveAccessibleName('Cell 4,4 Blocked');
});
