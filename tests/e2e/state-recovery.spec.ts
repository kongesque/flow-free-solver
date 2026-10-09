import { GENERATOR_WORKER_REQUEST, SOLVER_WORKER_REQUEST } from './worker-requests';
import { expect, test, type Page } from '@playwright/test';
import { openBoardOptions } from './board-options';
import { assertTopologySolution } from '../fixtures/assert-topology-solution.mjs';
import type { PuzzleDraft } from '../../src/hooks/useStorage';
import type { GameMode } from '../../src/solver/logic/game-modes';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
async function saved(page: Page): Promise<PuzzleDraft & { mode: GameMode }> {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('flow-solver-db'); r.onsuccess = () => resolve(r.result); });
        const state = await new Promise<any>(resolve => { const r = db.transaction('puzzle-state').objectStore('puzzle-state').get('current'); r.onsuccess = () => resolve(r.result); });
        db.close(); return state;
    });
}
async function generate(page: Page) {
    await button(page, 'Generate').click();
    await expect(page.getByRole('status')).toContainText('Generated');
    const mode = await page.getByRole('combobox', { name: 'Game Mode' }).inputValue();
    const labels = await page.locator('[data-cell]').evaluateAll(cells => cells.map(cell => cell.getAttribute('aria-label')!));
    const endpointLabels = labels.filter(label => label.includes('Color '));
    await expect.poll(async () => {
        const state = await saved(page);
        return state?.mode === mode && !!state.generatedPathSolution &&
            state.board.flat().filter(Boolean).length === endpointLabels.length &&
            endpointLabels.every(label => {
                const [, x, y, color] = label.match(/Cell (\d+),(\d+) Color (\d+)/)!;
                return state.board[Number(x)][Number(y)] === Number(color);
            });
    }).toBe(true);
    return saved(page);
}
async function solve(page: Page, draft: PuzzleDraft & { mode: GameMode }) {
    await button(page, 'Solve').click();
    await expect(button(page, 'Edit')).toBeEnabled();
    assertTopologySolution({ ...draft, input: '', topology: { walls: draft.walls, bridges: draft.bridges, warps: draft.warps } },
        JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!));
}

for (const failure of ['startup', 'postMessage'] as const) for (const operation of ['Solve', 'Generate'] as const) {
    test(`${operation} recovers from a worker ${failure} failure without refresh`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(failure => {
            const NativeWorker = Worker;
            let fail = true;
            window.Worker = class extends NativeWorker {
                constructor(url: string | URL, options?: WorkerOptions) {
                    if (fail && failure === 'startup') { fail = false; throw new DOMException('Worker startup blocked', 'SecurityError'); }
                    super(url, options);
                }
                postMessage(message: unknown, transfer: Transferable[] = []) {
                    if (fail && failure === 'postMessage') { fail = false; throw new DOMException('Request could not be cloned', 'DataCloneError'); }
                    super.postMessage(message, transfer);
                }
            };
            localStorage.setItem('flow-show-generator', 'true');
        }, failure);
        await page.goto('./');
        if (operation === 'Solve') for (let y = 0; y < 5; y++) {
            await button(page, `Cell 0,${y} Empty`).click();
            await button(page, `Cell 4,${y} Empty`).click();
        }
        await button(page, operation).click();
        await expect(button(page, 'Solve')).toBeEnabled();
        await expect(button(page, 'Generate')).toBeEnabled();
        expect(errors).toEqual([]);
        await button(page, 'Walls').click();
        await expect(page.getByRole('status')).toContainText('Walls');
        await button(page, 'Dots').click();
        if (operation === 'Solve') {
            await expect.poll(async () => (await saved(page))?.board.flat().filter(Boolean).length).toBe(10);
            await solve(page, await saved(page));
        } else await solve(page, await generate(page));
        expect(errors).toEqual([]);
    });
}

test('a malformed solve response leaves the board usable and a real worker can retry', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('flow-show-generator', 'true'));
    await page.goto('./');
    const draft = await generate(page);
    await page.route(SOLVER_WORKER_REQUEST, route => route.fulfill({
        contentType: 'text/javascript', headers: { 'Cross-Origin-Embedder-Policy': 'require-corp' },
        body: 'self.onmessage = () => self.postMessage({ board: [[1]] });',
    }));
    await button(page, 'Solve').click();
    await expect(page.getByRole('status')).toContainText('invalid solution');
    await expect(button(page, 'Solve')).toBeEnabled();
    await expect(page.locator('.endpoint-dot')).toHaveCount(draft.generatedPathSolution!.paths.length * 2);
    expect(errors).toEqual([]);
    await page.unroute(SOLVER_WORKER_REQUEST);
    await solve(page, draft);
    expect(errors).toEqual([]);
});

test('an interrupted saved-state read retries without freezing controls or losing the puzzle', async ({ page }) => {
    await page.addInitScript(() => {
        const get = IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get = function(key: IDBValidKey | IDBKeyRange) {
            const request = get.call(this, key);
            if (sessionStorage.getItem('interrupt-state-read') === 'true') {
                sessionStorage.removeItem('interrupt-state-read');
                this.transaction.abort();
            }
            return request;
        };
    });
    await page.goto('./');
    await button(page, 'Cell 0,0 Empty').click();
    await button(page, 'Cell 4,0 Empty').click();
    await expect.poll(async () => (await saved(page))?.board.flat().filter(Boolean).length).toBe(2);
    await page.evaluate(() => sessionStorage.setItem('interrupt-state-read', 'true'));
    await page.reload();
    await expect(button(page, 'Solve')).toBeEnabled();
    await expect(page.locator('.endpoint-dot')).toHaveCount(2);
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('warps');
    await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('standard');
    await expect(page.locator('.endpoint-dot')).toHaveCount(2);
});

for (const operation of ['Solve', 'Generate'] as const) {
    test(`mode and screen transitions cancel active ${operation} and preserve independent drafts`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array[0] = 42; return array; } });
        });
        await page.goto('./');
        const standard = operation === 'Solve' ? await generate(page) : null;
        const workerURL = operation === 'Solve' ? SOLVER_WORKER_REQUEST : GENERATOR_WORKER_REQUEST;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        await page.route(workerURL, async route => {
            await gate;
            await route.continue().catch(() => {});
        });
        try {
            const request = page.waitForRequest(workerURL);
            await button(page, operation).click();
            await request;
            await expect(button(page, 'Cancel')).toBeEnabled();
            await page.setViewportSize({ width: 390, height: 844 });
            await openBoardOptions(page);
            await page.getByRole('switch', { name: 'Color label' }).check();
            await page.getByRole('switch', { name: 'Puzzle generator' }).uncheck();
            await expect(button(page, 'Cancel')).toBeEnabled();
            await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('warps');
            await expect(button(page, 'Solve')).toBeEnabled();
            await expect(page.locator('.endpoint-dot')).toHaveCount(0);
        } finally {
            release();
            await page.unroute(workerURL);
        }
        await page.getByRole('switch', { name: 'Puzzle generator' }).check();
        const drafts = new Map<GameMode, PuzzleDraft & { mode: GameMode }>();
        if (standard) drafts.set('standard', standard);
        for (const [index, mode] of (['warps', 'bridges', 'standard'] as const).entries()) {
            await page.setViewportSize(index === 1 ? { width: 844, height: 390 } : { width: 1280, height: 900 });
            await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
            await expect(button(page, 'Solve')).toBeEnabled();
            if (!drafts.has(mode)) drafts.set(mode, await generate(page));
            await solve(page, drafts.get(mode)!);
            await expect(page.getByRole('status')).toContainText(/Solved\(\d+(?:\.\d+)?(?:ms|s)\)/);
            await expect(page.getByRole('group', { name: 'Editing tool' })).toBeVisible();
            await button(page, 'Walls').click();
            await expect(button(page, 'Solve')).toBeEnabled();
            await expect(page.locator('.endpoint-dot')).toHaveCount(drafts.get(mode)!.generatedPathSolution!.paths.length * 2);
            await button(page, 'Dots').click();
        }
        for (const mode of ['bridges', 'warps', 'standard'] as const) {
            await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
            await expect.poll(async () => (await saved(page))?.mode).toBe(mode);
            expect((await saved(page)).board).toEqual(drafts.get(mode)!.board);
            await solve(page, drafts.get(mode)!);
        }
        expect(errors).toEqual([]);
    });
}

test('resizing the screen during a wall stroke cancels the draft and releases pointer capture', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./');
    await button(page, 'Walls').click();
    const grid = page.getByRole('article', { name: 'Puzzle Grid Board' });
    const rect = (await grid.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 5, rect.y + rect.height / 10);
    await page.mouse.down();
    await expect(grid.locator('.puzzle-wall')).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(grid.locator('.puzzle-wall')).toHaveCount(0);
    await page.mouse.up();
    await expect(grid.locator('.puzzle-wall')).toHaveCount(0);
    await button(page, 'Dots').click();
    await button(page, 'Cell 0,0 Empty').click();
    await expect(page.locator('.endpoint-dot')).toHaveCount(1);
});
