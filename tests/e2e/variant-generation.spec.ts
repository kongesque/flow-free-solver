import { test, expect, type Page } from '@playwright/test';
import { openBoardOptions } from './board-options';
import { assertTopologySolution } from '../fixtures/assert-topology-solution.mjs';
import type { PuzzleDraft } from '../../src/hooks/useStorage';
import type { PuzzleSolution } from '../../src/solver/logic/solution';

async function saved(page: Page): Promise<PuzzleDraft> {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('flow-solver-db'); r.onsuccess = () => resolve(r.result); });
        const state = await new Promise<PuzzleDraft>(resolve => { const r = db.transaction('puzzle-state').objectStore('puzzle-state').get('current'); r.onsuccess = () => resolve(r.result); });
        db.close(); return state;
    });
}

for (const mode of ['bridges', 'warps'] as const) for (const [width, height] of [[5, 5], [8, 5], [5, 8], [15, 15]]) {
    test(`generate, solve and reload ${mode} ${width}x${height} with real workers`, async ({ page }) => {
        await page.setViewportSize({ width: width === 8 ? 390 : 1280, height: 900 });
        await page.addInitScript(() => {
            const Original = Worker;
            window.Worker = class extends Original {
                constructor(url: string | URL, options?: WorkerOptions) {
                    super(url, options);
                    this.addEventListener('message', event => {
                        if (event.data.status) (window as unknown as { solverStatus: string }).solverStatus = event.data.status;
                    });
                }
                postMessage(message: any) { super.postMessage({ ...message, seed: 42 }); }
            };
        });
        await page.goto('./'); await openBoardOptions(page);
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
        await page.getByRole('combobox', { name: 'Grid Width' }).selectOption(String(width));
        await page.getByRole('combobox', { name: 'Grid Height' }).selectOption(String(height));
        await page.locator('.board-options summary').click();
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Generated');
        await expect.poll(async () => !!(await saved(page))?.generatedPathSolution).toBe(true);
        const draft = await saved(page);
        const fixture = { width, height, mode, board: draft.board, input: '',
            topology: { walls: draft.walls, bridges: draft.bridges, warps: draft.warps }, solution: draft.generatedPathSolution! };
        assertTopologySolution(fixture, draft.generatedPathSolution!);
        expect(draft[mode].length).toBeGreaterThan(0);
        await expect(page.locator('.endpoint-dot')).toHaveCount(draft.generatedPathSolution!.paths.length * 2);
        const bounds = await page.locator('.puzzle-grid').boundingBox();
        await page.screenshot({ path: test.info().outputPath('generated-editor.png'), fullPage: true });
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved', { timeout: 30_000 });
        if (width <= 8 && height <= 8) expect(await page.evaluate(() => (window as unknown as { solverStatus: string }).solverStatus)).toBe('solved');
        assertTopologySolution(fixture, JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!) as PuzzleSolution);
        expect(await page.locator('.puzzle-grid').boundingBox()).toEqual(bounds);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: test.info().outputPath('generated-solved.png'), fullPage: true });
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('standard');
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
        await expect(page.getByRole('status')).toContainText('Generated');
        await page.reload();
        await expect(page.getByRole('status')).toContainText('Generated');
        expect((await saved(page)).generatedPathSolution).toEqual(draft.generatedPathSolution);
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved', { timeout: 30_000 });
        assertTopologySolution(fixture, JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!) as PuzzleSolution);
    });
}

for (const mode of ['bridges', 'warps'] as const) {
    test(`${mode} generation confirmation, cancellation and failure preserve the draft`, async ({ page }) => {
        await page.goto('./');
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
        await page.getByRole('button', { name: mode === 'bridges' ? 'Bridges' : 'Warps', exact: true }).click();
        await page.getByRole('button', { name: mode === 'bridges' ? 'Cell 2,2 Empty' : 'Row 3 warp, left', exact: true }).click();
        await expect.poll(async () => (await saved(page))?.[mode].length).toBe(1);
        const before = await saved(page);
        page.once('dialog', dialog => dialog.dismiss());
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        expect((await saved(page))[mode]).toEqual(before[mode]);
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        await page.route(/generator\.worker/, async route => { await gate; await route.continue().catch(() => {}); });
        try {
            page.once('dialog', dialog => dialog.accept());
            const request = page.waitForRequest(/generator\.worker/);
            await page.getByRole('button', { name: 'Generate', exact: true }).click();
            await request;
            await page.getByRole('button', { name: 'Cancel', exact: true }).click();
            release(); await page.unroute(/generator\.worker/);
            expect((await saved(page))[mode]).toEqual(before[mode]);
            await page.route(/generator\.worker/, route => route.abort());
            page.once('dialog', dialog => dialog.accept());
            await page.getByRole('button', { name: 'Generate', exact: true }).click();
            await expect(page.getByRole('status')).toContainText('Could not generate');
            expect((await saved(page))[mode]).toEqual(before[mode]);
            await page.unroute(/generator\.worker/);
            page.once('dialog', dialog => dialog.accept());
            await page.getByRole('button', { name: 'Generate', exact: true }).click();
            await expect(page.getByRole('status')).toContainText('Generated');
            await expect.poll(async () => !!(await saved(page))?.generatedPathSolution).toBe(true);
            await page.getByRole('button', { name: 'Walls', exact: true }).click();
            await page.getByRole('button', { name: /^Cell 0,0 / }).focus();
            await page.keyboard.press('Shift+ArrowRight');
            await expect.poll(async () => (await saved(page))?.generatedPathSolution).toBeNull();
            await page.getByRole('button', { name: 'Undo', exact: true }).click();
            await expect.poll(async () => (await saved(page))?.generatedPathSolution).toBeNull();
        } finally { release(); await page.unroute(/generator\.worker/); }
    });

    test(`${mode} retains both lane paths when independent search reaches its limit after reload`, async ({ page }) => {
        await page.addInitScript(() => {
            const Original = Worker;
            window.Worker = class extends Original {
                postMessage(message: any) {
                    if (message.type) queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: { timedOut: true, board: null, solution: null } })));
                    else super.postMessage(message);
                }
            };
        });
        await page.goto('./');
        await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(mode);
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        await expect.poll(async () => !!(await saved(page))?.generatedPathSolution).toBe(true);
        const draft = await saved(page);
        await page.reload();
        await expect(page.getByRole('status')).toContainText('Generated');
        await page.getByRole('button', { name: 'Solve', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Solved');
        await expect(page.getByRole('status')).toContainText(/\(\d+(?:\.\d+)?(?:ms|s)\)/);
        const paths = JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!) as PuzzleSolution;
        expect(paths).toEqual(draft.generatedPathSolution);
        assertTopologySolution({ width: 5, height: 5, board: draft.board, mode, input: '', solution: paths,
            topology: { walls: draft.walls, bridges: draft.bridges, warps: draft.warps } }, paths);
    });
}
