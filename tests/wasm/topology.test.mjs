import assert from 'node:assert/strict';
import { test } from 'node:test';
import createModule from '../../public/wasm/flow_solver_c.mjs';
import { warpRows, bridgeCross, largeBridgeCover } from '../fixtures/topology-puzzles.mjs';
import { assertTopologySolution, decodeNativeSolution } from '../fixtures/assert-topology-solution.mjs';

const module = await createModule();
const solve = module.cwrap('solve_puzzle_topology_wasm', 'string', ['string', 'string']);
const wire = ({ mode, topology }) => `V1\nMODE,${mode === 'warps' ? 'W' : 'B'}\n` +
  topology.walls.map(w => `W,${w.x},${w.y},${w.side === 'right' ? 'R' : 'D'}\n`).join('') +
  [...topology.bridges].reverse().map(b => `B,${b.x},${b.y},${b.over === 'horizontal' ? 'H' : 'V'}\n`).join('') +
  topology.warps.map(w => `S,${w.axis === 'horizontal' ? 'H' : 'V'},${w.index}\n`).join('');

for (const fixture of [warpRows(), warpRows(8, 5), warpRows(15, 15), warpRows(8, 5, true), bridgeCross(), bridgeCross(true), bridgeCross(false, 'vertical'), largeBridgeCover()]) {
  test(`real C graph cover: ${fixture.mode} ${fixture.width}x${fixture.height}`, () => {
    const result = JSON.parse(solve(fixture.input, wire(fixture)));
    assert.equal(result.status, 'solved');
    assertTopologySolution(fixture, decodeNativeSolution(fixture, result));
  });
}

test('closing a required seam is unsatisfiable; duplicate records and CRLF are accepted', () => {
  const f = warpRows();
  assert.equal(JSON.parse(solve(f.input, wire(f).replace('S,H,0\n', ''))).status, 'unsatisfiable');
  const result = JSON.parse(solve(f.input, (wire(f) + 'S,H,0\n').trimEnd().replaceAll('\n', '\r\n')));
  assert.equal(result.status, 'solved');
  assertTopologySolution(f, decodeNativeSolution(f, result));
});

for (const topology of ['', 'V2\nMODE,W\n', 'V1\nMODE,X\n', 'V1\nMODE,W\nS,H,5', 'V1\nMODE,W\nS,H,-1', 'V1\nMODE,W\nS,H,0junk',
  'V1\nMODE,B\nB,0,0,H', 'V1\nMODE,W\nB,2,2,H', 'V1\nMODE,B\nS,H,0', 'V1\nMODE,B\nB,2,2,H\nW,2,2,R',
  'V1\nMODE,B\nB,2,2,H\nB,2,2,V', 'V1\nMODE,B\nW,4,0,R', 'V1\nMODE,W\n\n', 'V1\rMODE,W']) {
  test(`rejects malformed topology ${JSON.stringify(topology)}`, () => {
    assert.equal(JSON.parse(solve(warpRows().input, topology)).status, 'invalid');
  });
}

test('repeated variant, invalid and Standard calls do not retain topology', () => {
  const legacy = module.cwrap('solve_puzzle_wasm', 'string', ['string']);
  for (let i = 0; i < 5; i++) {
    for (const f of [bridgeCross(), warpRows()]) {
      const result = JSON.parse(solve(f.input, wire(f)));
      assertTopologySolution(f, decodeNativeSolution(f, result));
      assert.equal(JSON.parse(solve(f.input, 'invalid')).status, 'invalid');
    }
    assert.ok(Array.isArray(JSON.parse(legacy('R...R\nB...B\nY...Y\nG...G\nO...O\n'))));
  }
});
