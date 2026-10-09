import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'native/flow_solver.c');
const output = join(root, 'public/wasm');
const compiler = process.env.EMCC || 'emcc';

function build() {
  const temporary = mkdtempSync(join(tmpdir(), 'flow-free-wasm-'));
  try {
    const result = spawnSync(compiler, [
      source, '-O3', '-std=c11', '-lm', '--no-entry',
      '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sEXPORT_NAME=createFlowSolver',
      '-sENVIRONMENT=web,worker,node',
      '-sEXPORTED_FUNCTIONS=["_solve_puzzle_wasm","_solve_puzzle_with_walls_wasm","_solve_puzzle_topology_wasm"]',
      '-sEXPORTED_RUNTIME_METHODS=["cwrap"]',
      '-sALLOW_MEMORY_GROWTH=1', '-sMAXIMUM_MEMORY=536870912',
      '-sFILESYSTEM=0',
      '-o', join(temporary, 'flow_solver_c.mjs'),
    ], {
      cwd: root,
      stdio: 'inherit',
      // Homebrew's emcc may point at a different Node installation. Use the
      // same runtime as this build script, while respecting explicit overrides.
      env: { ...process.env, EM_NODE_JS: process.env.EM_NODE_JS || process.execPath },
    });
    if (result.error?.code === 'ENOENT') {
      throw new Error('Emscripten was not found. Install/activate emsdk (see README.md), or set EMCC to the compiler path.');
    }
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Emscripten failed (exit ${result.status}).`);
    mkdirSync(output, { recursive: true });
    for (const name of ['flow_solver_c.mjs', 'flow_solver_c.wasm']) {
      copyFileSync(join(temporary, name), join(output, name));
    }
    console.log('Built native/flow_solver.c → public/wasm/flow_solver_c.{mjs,wasm}');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  build();
  if (process.argv.includes('--watch')) {
    let timer;
    console.log('Watching native/ for C changes. Keep npm run dev running in another terminal.');
    watch(join(root, 'native'), (_, filename) => {
      if (!filename || !/\.[ch]$/.test(filename)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { build(); } catch (error) { console.error(error.message); }
      }, 150);
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
