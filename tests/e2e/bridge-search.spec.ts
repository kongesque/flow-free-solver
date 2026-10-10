import { expect, test } from '@playwright/test';
import { bridgeScreenshot } from '../fixtures/bridge-screenshot.mjs';
import { assertTopologySolution } from '../fixtures/assert-topology-solution.mjs';
import { solverWorkerUrl, solveSat } from './z3-test-worker';
import { openBoardOptions } from './board-options';
import type { PuzzleSolution } from '../../src/solver/logic/solution';

test('SAT solves the 12x15 Bridges screenshot without a generated certificate', async ({ page }) => {
  const fixture = bridgeScreenshot(), url = await solverWorkerUrl(page);
  const result = await solveSat(page, url, fixture.board, fixture.topology, fixture.mode);
  expect(result.status).toBe('solved');
  assertTopologySolution(fixture, result.solution!);
});

test('automatic SAT fallback solves the screenshot in the editor and preserves its endpoints', async ({ page }) => {
  const fixture = bridgeScreenshot(), requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('./'); await openBoardOptions(page);
  await page.getByRole('combobox', { name: 'Game Mode' }).selectOption('bridges');
  await page.getByRole('combobox', { name: 'Grid Width' }).selectOption('12');
  await page.getByRole('combobox', { name: 'Grid Height' }).selectOption('15');
  for (const color of [1, 4, 2, 3, 5, 6, 7, 8, 9]) for (let y = 0; y < 15; y++) for (let x = 0; x < 12; x++) {
    if (fixture.board[x][y] === color) await page.locator(`[data-cell="${x},${y}"]`).click();
  }
  await page.getByRole('button', { name: 'Bridges', exact: true }).click();
  for (const { x, y } of fixture.topology.bridges) await page.locator(`[data-cell="${x},${y}"]`).click();
  await page.getByRole('switch', { name: 'Color label', exact: true }).check();
  await page.getByRole('switch', { name: 'Board guides', exact: true }).check();
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Solved', { timeout: 45_000 });
  const solution = JSON.parse((await page.locator('.puzzle-grid').getAttribute('data-solution'))!) as PuzzleSolution;
  assertTopologySolution(fixture, solution);
  expect(requests.some(url => url.includes('flow_solver_c.wasm'))).toBe(true);
  expect(requests.some(url => url.includes('z3-built.wasm'))).toBe(true);
  await expect(page.locator('.endpoint-dot')).toHaveCount(18);
  await page.screenshot({ path: test.info().outputPath('bridge-screenshot-solved.png'), fullPage: true });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('.endpoint-dot')).toHaveCount(18);
  await expect(page.locator('[data-bridge]')).toHaveCount(2);
});

test('preferred paths being unsatisfiable still permits a full self-touching cover', async ({ page }) => {
  const url = await solverWorkerUrl(page);
  const fixture = { width: 2, height: 2, board: [[1, 0], [1, 0]], input: 'RR\n..\n',
    topology: { bridges: [], walls: [], warps: [] }, mode: 'bridges' as const };
  // All four cells must be red. Their selected U-shaped path is legal even
  // though the endpoints also have an unselected same-color contact.
  const result = await solveSat(page, url, fixture.board, fixture.topology, fixture.mode);
  expect(result.status).toBe('solved');
  assertTopologySolution(fixture, result.solution!);
  const impossible = await solveSat(page, url, [[1, 0], [0, 1]], fixture.topology, fixture.mode);
  expect(impossible.status).toBe('unsatisfiable');
});
