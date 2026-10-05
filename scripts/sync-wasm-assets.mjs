import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public/wasm');
const z3 = dirname(require.resolve('z3-solver'));
mkdirSync(output, { recursive: true });

// Keep the glue, Wasm, and any pthread helper on the same installed Z3 version.
const assets = readdirSync(z3).filter(name => /^z3-built(?:\.worker)?\.(?:js|wasm)$/.test(name));
if (!assets.includes('z3-built.js') || !assets.includes('z3-built.wasm')) {
  throw new Error('The installed z3-solver package is missing its runtime assets.');
}
for (const name of readdirSync(output)) {
  if (/^z3-built/.test(name) && !assets.includes(name)) rmSync(join(output, name));
}
for (const name of assets) copyFileSync(join(z3, name), join(output, name));
copyFileSync(require.resolve('coi-serviceworker/coi-serviceworker.js'), join(root, 'public/coi-serviceworker.js'));
for (const name of ['flow_solver_c.mjs', 'flow_solver_c.wasm']) {
  if (!existsSync(join(output, name))) throw new Error(`Missing ${name}. Run npm run build:wasm first.`);
}
console.log('Synchronized Z3 and cross-origin isolation runtime assets.');
