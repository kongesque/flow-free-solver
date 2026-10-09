import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { demoPuzzles } from './demo-puzzles.mjs';
import { assertTopologySolution } from '../tests/fixtures/assert-topology-solution.mjs';
import { COLOR_PLACEMENT_ORDER } from '../src/solver/logic/color-order.ts';

// Run against npm run dev -- --host 127.0.0.1 --port 4173.
// Requires the project's installed Chromium and ffmpeg on PATH.
const baseURL = process.env.DEMO_URL ?? 'http://127.0.0.1:4173/';
const output = fileURLToPath(new URL('../assets/demos/', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'flow-demos-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const puzzle of demoPuzzles) {
    // A 4:3 desktop view keeps both the board and controls visible in README cards.
    const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // Keep recording preferences separate from the user's browser session.
      await page.addInitScript(() => {
        localStorage.setItem('flow-show-generator', 'false');
        localStorage.setItem('flow-coordinates', 'false');
      });
      await page.goto(baseURL);
      await page.getByRole('combobox', { name: 'Game Mode' }).selectOption(puzzle.mode);
      await page.getByRole('combobox', { name: 'Grid Size' }).selectOption(String(puzzle.width));
      await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeEnabled();
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      const frames = [];
      const capture = async duration => {
        const path = join(scratch, `${puzzle.id}-${frames.length}.png`);
        await page.screenshot({ path });
        frames.push({ path, duration });
      };
      const cell = (x, y) => page.locator(`[data-cell="${x},${y}"]`);
      await capture(1);
      for (const color of COLOR_PLACEMENT_ORDER.filter(color => puzzle.board.some(column => column.includes(color)))) {
        for (let y = 0; y < puzzle.height; y++) for (let x = 0; x < puzzle.width; x++) {
          if (puzzle.board[x][y] !== color) continue;
          await cell(x, y).click();
          await page.mouse.move(0, 0);
          await capture(.25);
        }
      }
      if (puzzle.topology.walls.length) {
        await page.getByRole('button', { name: 'Walls', exact: true }).click();
        await capture(.5);
        for (const wall of puzzle.topology.walls) {
          // Click the real shared edge, as a user would, rather than inject state.
          const bounds = await cell(wall.x, wall.y).boundingBox();
          assert.ok(bounds);
          await page.mouse.click(
            bounds.x + bounds.width * (wall.side === 'right' ? 1 : .5),
            bounds.y + bounds.height * (wall.side === 'down' ? 1 : .5),
          );
          await page.mouse.move(0, 0);
          await capture(.1);
        }
        await expect(page.locator('.puzzle-wall')).toHaveCount(puzzle.topology.walls.length);
      }
      if (puzzle.mode === 'bridges') {
        await page.getByRole('button', { name: 'Bridges', exact: true }).click();
        await capture(.5);
        for (const bridge of puzzle.topology.bridges) {
          await cell(bridge.x, bridge.y).click();
          await page.mouse.move(0, 0);
          await capture(.5);
        }
      }
      if (puzzle.mode === 'warps') {
        await page.getByRole('button', { name: 'Warps', exact: true }).click();
        await capture(.5);
        for (const seam of puzzle.topology.warps) {
          await page.getByRole('button', { name: `${seam.axis === 'horizontal' ? 'Row' : 'Column'} ${seam.index + 1} warp, ${seam.axis === 'horizontal' ? 'left' : 'top'}`, exact: true }).click();
          await page.mouse.move(0, 0);
          await capture(.5);
        }
      }
      await page.getByRole('button', { name: 'Dots', exact: true }).click();
      await page.mouse.move(0, 0);
      await capture(1);
      await page.getByRole('button', { name: 'Solve', exact: true }).click();
      await page.mouse.move(0, 0);
      const deadline = Date.now() + 30_000;
      while (!(await page.getByRole('status').textContent()).includes('Solved')) {
        assert.ok(Date.now() < deadline, `Solving timed out: ${puzzle.id}`);
        assert.equal(await page.getByRole('alert').count(), 0, `Solve error: ${puzzle.id}`);
        await capture(.1);
      }
      const solution = JSON.parse(await page.locator('.puzzle-grid').getAttribute('data-solution'));
      assertTopologySolution(puzzle, solution);
      assert.deepEqual(errors, []);
      await expect(page.locator('.endpoint-dot')).toHaveCount(solution.paths.length * 2);
      await capture(4);
      // Keep a still for documentation / inspecting the actual final frame.
      await page.screenshot({ path: join(scratch, `${puzzle.id}-solved.png`) });
      const list = join(scratch, `${puzzle.id}.txt`);
      await writeFile(list, frames.map(frame => `file '${frame.path.replaceAll("'", "'\\''")}'\nduration ${frame.duration}\n`).join('') + `file '${frames.at(-1).path}'\n`);
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
        '-filter_complex', 'fps=10,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none',
        '-t', String(frames.reduce((seconds, frame) => seconds + frame.duration, 0)),
        '-loop', '0', join(scratch, `${puzzle.id}.gif`)], { stdio: 'inherit' });
      console.log(`${puzzle.title}: validated ${solution.paths.length} paths; recorded ${frames.length} stages.`);
    } finally {
      await context.close();
    }
  }
  // Publish only after every real-worker solve and GIF encode has succeeded.
  for (const puzzle of demoPuzzles) await copyFile(join(scratch, `${puzzle.id}.gif`), join(output, `${puzzle.id}.gif`));
  console.log(`GIFs saved to ${output}`);
  if (process.env.DEMO_KEEP_FRAMES === '1') console.log(`Inspection stills saved to ${scratch}`);
} finally {
  await browser.close();
  if (process.env.DEMO_KEEP_FRAMES !== '1') await rm(scratch, { recursive: true, force: true });
}
