import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('a missing compiler reports setup instructions and preserves both artifacts', () => {
  const artifacts = ['flow_solver_c.mjs', 'flow_solver_c.wasm']
    .map(name => new URL(`../../public/wasm/${name}`, import.meta.url));
  const before = artifacts.map(path => readFileSync(path));
  const root = new URL('../../', import.meta.url);
  const result = spawnSync(process.execPath, ['scripts/build-wasm.mjs'], {
    cwd: root,
    env: { ...process.env, EMCC: new URL('missing-compiler', root).pathname },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Emscripten was not found/);
  assert.match(result.stderr, /README.md/);
  artifacts.forEach((path, index) => assert.deepEqual(readFileSync(path), before[index]));
});
