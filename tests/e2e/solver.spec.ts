import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { assertSolution } from '../fixtures/assert-solution.mjs';

const input = readFileSync(new URL('../fixtures/puzzles/regular_5x5_01.txt', import.meta.url), 'utf8');
const colors = ['', 'R', 'B', 'Y', 'G', 'O', 'C', 'M', 'm', 'P', 'A', 'W', 'g', 'T', 'b', 'c', 'p'];

async function placePuzzle(page: Page) {
  const rows = input.trim().split('\n');
  for (const color of colors.slice(1, 6)) {
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if (rows[y][x] === color) await page.getByRole('button', { name: `Cell ${x},${y} Empty`, exact: true }).click();
      }
    }
  }
}

for (const algorithm of ['heuristic_bfs', 'astar', 'z3']) {
  test(`${algorithm}: edit, solve with a real worker, reset`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const failedAssets: string[] = [];
    page.on('response', response => {
      if (response.status() >= 400 && /wasm|worker/.test(response.url())) failedAssets.push(response.url());
    });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: /Flow Free Solver/i })).toBeVisible();
    await expect.poll(() => page.evaluate(() => crossOriginIsolated)).toBe(true);
    await page.getByRole('combobox', { name: 'Solver Algorithm' }).selectOption(algorithm);
    await placePuzzle(page);
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solved', { timeout: 45_000 });
    const labels = await page.getByRole('article', { name: 'Puzzle Grid Board' }).getByRole('button').evaluateAll(
      cells => cells.map(cell => cell.getAttribute('aria-label')!),
    );
    const solution = Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 5 }, (_, x) => colors[Number(labels[y * 5 + x].split('Color ')[1])]?.charCodeAt(0) ?? 0),
    );
    assertSolution(input, solution);
    if (algorithm === 'heuristic_bfs') {
      await page.screenshot({ path: test.info().outputPath('solved-puzzle.png') });
    }
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: /Cell .* Color/ })).toHaveCount(10);
    await expect(page.getByRole('button', { name: /Cell .* Color/ }).first()).toBeEnabled();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(25);
    expect(errors).toEqual([]);
    expect(failedAssets).toEqual([]);
  });
}

test('reset cancels an active Wasm solve and allows a fresh puzzle', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/wasm/flow_solver_c.wasm', async route => {
    await gate;
    await route.continue().catch(() => {}); // Reset can cancel the pending fetch.
  });
  try {
    await page.goto('./');
    await placePuzzle(page);
    const request = page.waitForRequest(/flow_solver_c\.wasm/);
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await request;
    await expect(page.getByRole('status')).toContainText('Solving');
    await expect(page.getByRole('combobox', { name: 'Grid Size' })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: 'Solver Algorithm' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cell 0,0 Color 1', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(25);
    release();
    await placePuzzle(page);
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Solved');
  } finally {
    release();
  }
});

test('shows validation feedback and preserves endpoints after reload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Please place some endpoints');
  await page.getByRole('button', { name: 'Cell 0,0 Empty', exact: true }).click();
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('missing an endpoint');
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open('flow-solver-db');
      request.onsuccess = () => resolve(request.result);
    });
    const state = await new Promise<{ board: number[][] }>(resolve => {
      const request = db.transaction('puzzle-state').objectStore('puzzle-state').get('current');
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return state?.board[0][0];
  })).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cell 0,0 Color 1', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Grid Size' }).selectOption('15');
  await expect(page.getByRole('button', { name: /Cell .* Empty/ })).toHaveCount(225);
});
