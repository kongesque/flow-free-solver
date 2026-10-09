import { expect, type Page } from '@playwright/test';
import type { Board } from '../../src/solver/logic/astar-solver';
import type { PuzzleTopology } from '../../src/solver/logic/topology';
import type { PuzzleSolution } from '../../src/solver/logic/solution';

export async function solverWorkerUrl(page: Page) {
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

export async function solveSat(page: Page, url: string, board: Board, topology: PuzzleTopology, mode: 'standard' | 'bridges' | 'warps', candidate?: PuzzleSolution) {
    return page.evaluate(({ url, board, topology, mode, candidate }) => new Promise<{
        status: string; board: Board | null; solution: PuzzleSolution | null; error?: string;
    }>((resolve, reject) => {
        const worker = new Worker(url, { type: 'module' });
        worker.onmessage = event => { worker.terminate(); resolve(event.data); };
        worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
        worker.postMessage({ board, ...topology, type: 'z3', mode, allowFallback: false, satCandidate: candidate });
    }), { url, board, topology, mode, candidate });
}
