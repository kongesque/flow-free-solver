import assert from 'node:assert/strict';
import { test } from 'node:test';
import createModule from '../../public/wasm/flow_solver_c.mjs';
import { blockRows, blockBridge, blockWire, screenshotBlocks } from '../fixtures/block-puzzles.mjs';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { assertTopologySolution, decodeNativeSolution } from '../fixtures/assert-topology-solution.mjs';

const module = await createModule();
const classic = module.cwrap('solve_puzzle_wasm', 'string', ['string']);
const walls = module.cwrap('solve_puzzle_with_walls_wasm', 'string', ['string', 'string']);
const variants = module.cwrap('solve_puzzle_topology_wasm', 'string', ['string', 'string']);
test('Blocks: solves the 11x11 screenshot with walls and the center hole', () => {
  const f = screenshotBlocks();
  const wire = f.topology.walls.map(w => `${w.x},${w.y},${w.side === 'right' ? 'R' : 'D'}\n`).join('');
  assertSolution(f.input, JSON.parse(walls(f.input, wire)), f.topology.walls);
});
for (const [width, height] of [[5, 5], [5, 19], [19, 5], [11, 11], [19, 19]]) {
  for (const f of [blockRows(width, height), blockRows(width, height, 'warps'), blockBridge(width, height)]) {
    test(`Blocks: native ${f.mode} ${width}x${height} covers playable cells`, () => {
      assertTopologySolution(f, f.solution);
      if (f.mode === 'standard') {
        assertSolution(f.input, JSON.parse(classic(f.input)));
        // Walls can coexist with holes without changing the required cover.
        assertSolution(f.input, JSON.parse(walls(f.input, '0,0,D\n')), [{ x: 0, y: 0, side: 'down' }]);
      } else {
        const raw = JSON.parse(variants(f.input, blockWire(f)));
        assert.equal(raw.status, 'solved');
        assertTopologySolution(f, decodeNativeSolution(f, raw));
      }
    });
  }
}

test('Blocks: all unused cells stay zero, even with no free search cells', () => {
  const input = 'RR###\n#####\n#####\n#####\n#####\n';
  assertSolution(input, JSON.parse(classic(input)));
  for (const mode of ['B', 'W']) {
    const raw = JSON.parse(variants(input, `V1\nMODE,${mode}\n`));
    assert.equal(raw.status, 'solved'); assert.deepEqual(raw.paths[0].nodes.sort(), [0, 1]);
  }
});

test('Blocks: stranded playable cells are unsatisfiable, never silently omitted', () => {
  const input = 'RR###\n#####\n##.##\n#####\n#####\n';
  assert.match(classic(input), /result code 1/);
  for (const mode of ['B', 'W']) assert.equal(JSON.parse(variants(input, `V1\nMODE,${mode}\n`)).status, 'unsatisfiable');
});

test('Blocks: native validation rejects blocked warp borders and bridge sides', () => {
  const f = blockRows();
  assert.equal(JSON.parse(variants(f.input, 'V1\nMODE,W\nS,H,0\n')).status, 'invalid');
  const bridge = blockBridge();
  const rows = bridge.input.trim().split('\n'); rows[1] = rows[1].slice(0, 2) + '#' + rows[1].slice(3);
  assert.equal(JSON.parse(variants(rows.join('\n'), blockWire(bridge))).status, 'invalid');
});

test('Blocks: interleaved boards do not retain a previous mask', () => {
  for (let i = 0; i < 3; i++) {
    const f = blockRows(); assertSolution(f.input, JSON.parse(classic(f.input)));
    const input = 'R...R\nB...B\nY...Y\nG...G\nO...O\n';
    assertSolution(input, JSON.parse(classic(input)));
  }
});

test('Blocks: a difficult 19x19 mask reports its search limit without claiming unsatisfiable', () => {
  const f = blockRows(19, 19, 'standard', 15);
  assertTopologySolution(f, f.solution);
  assert.equal(classic(f.input), 'Error: No solution found (result code 2)');
});

test('Blocks: Classic and variant pruning agree with an exhaustive masked-board oracle', () => {
  // Independent enumeration of every path; checks final induced degrees for
  // Classic and distinct crossing colors for Bridges. No solver helpers used.
  function oracle(f, induced) {
    const holes = new Set(f.topology.blocks.map(b => b.y * 3 + b.x));
    const crossing = f.topology.bridges.length > 0, count = crossing ? 10 : 9;
    const edges = Array.from({ length: count }, () => new Set());
    const add = (a, b) => { if (!holes.has(a) && !holes.has(b)) { edges[a].add(b); edges[b].add(a); } };
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) for (const [dx, dy, side] of [[1, 0, 'right'], [0, 1, 'down']]) {
      if (x + dx >= 3 || y + dy >= 3 || f.topology.walls.some(w => w.x === x && w.y === y && w.side === side)) continue;
      const a = y * 3 + x, b = (y + dy) * 3 + x + dx;
      add(crossing && dy && a === 4 ? 9 : a, crossing && dy && b === 4 ? 9 : b);
    }
    for (const seam of f.topology.warps) add(seam.axis === 'horizontal' ? seam.index * 3 : seam.index,
      seam.axis === 'horizontal' ? seam.index * 3 + 2 : seam.index + 6);
    const pairs = [1, 2].map(c => Array.from({ length: 9 }, (_, id) => id).filter(id => f.board[id % 3][Math.floor(id / 3)] === c));
    const owner = Array(count).fill(-1); holes.forEach(id => { owner[id] = 99; });
    pairs.forEach((pair, c) => pair.forEach(id => { owner[id] = c; }));
    function nextColor(c) {
      if (c === 2) {
        if (owner.includes(-1) || crossing && owner[4] === owner[9]) return false;
        return !induced || edges.every((neighbors, id) => holes.has(id) || [...neighbors].filter(n => owner[n] === owner[id]).length === (pairs.flat().includes(id) ? 1 : 2));
      }
      const [start, goal] = pairs[c];
      function path(id) {
        for (const n of edges[id]) {
          if (n === goal) { if (nextColor(c + 1)) return true; }
          else if (owner[n] === -1) { owner[n] = c; if (path(n)) return true; owner[n] = -1; }
        }
        return false;
      }
      return path(start);
    }
    return nextColor(0);
  }
  let seed = 88417;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (const mode of ['standard', 'warps', 'bridges']) for (let i = 0; i < 80; i++) {
    const crossing = mode === 'bridges' && i % 2 === 0;
    const board = Array.from({ length: 3 }, () => Array(3).fill(0));
    const cells = Array.from({ length: 9 }, (_, id) => id).filter(id => !crossing || id !== 4);
    for (let j = cells.length - 1; j > 0; j--) { const k = random(j + 1); [cells[j], cells[k]] = [cells[k], cells[j]]; }
    cells.slice(0, 4).forEach((id, j) => { board[id % 3][Math.floor(id / 3)] = j < 2 ? 1 : 2; });
    const blocks = cells.slice(4).filter(id => (!crossing || [0, 2, 6, 8].includes(id)) && random(3) === 0).map(id => ({ x: id % 3, y: Math.floor(id / 3) }));
    const topology = { blocks, bridges: crossing ? [{ x: 1, y: 1, over: 'horizontal' }] : [], walls: [], warps: [] };
    for (const axis of mode === 'warps' ? ['horizontal', 'vertical'] : []) for (let index = 0; index < 3; index++) {
      if (!blocks.some(b => axis === 'horizontal' ? b.y === index && b.x !== 1 : b.x === index && b.y !== 1) && random(2)) topology.warps.push({ axis, index });
    }
    const f = { width: 3, height: 3, mode, board, topology, input: Array.from({ length: 3 }, (_, y) => board.map((col, x) => blocks.some(b => b.x === x && b.y === y) ? '#' : '.RB'[col[y]]).join('')).join('\n') };
    const response = mode === 'standard' ? classic(f.input) : variants(f.input, blockWire(f));
    const result = mode === 'standard' ? { status: response.startsWith('Error') ? 'unsatisfiable' : 'solved' } : JSON.parse(response);
    assert.equal(result.status === 'solved', oracle(f, mode === 'standard'), `${mode} mask oracle disagreement ${i}`);
    assert.equal(result.status === 'solved' || result.status === 'unsatisfiable', true);
    if (result.status === 'solved') {
      if (mode === 'standard') assertSolution(f.input, JSON.parse(response));
      else assertTopologySolution(f, decodeNativeSolution(f, result));
    } else if (mode === 'standard') assert.match(response, /result code 1/);
  }
});
