import assert from 'node:assert/strict';

// Deliberately independent of app topology/solution helpers and native IDs.
export function assertTopologySolution(fixture, solution) {
  const { width, height, board, topology, mode } = fixture;
  assert.equal(solution.version, 1);
  const bridges = new Map(topology.bridges.map(b => [`${b.x},${b.y}`, b]));
  const key = n => `${n.x},${n.y},${n.lane}`;
  const occupied = new Map(), colors = new Set();
  const endpoints = new Map();
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) if (board[x][y]) {
    const color = board[x][y]; endpoints.set(color, [...(endpoints.get(color) ?? []), `${x},${y},cell`]);
  }
  const wallBlocked = (a, b) => topology.walls.some(w =>
    (a.y === b.y && w.side === 'right' && w.y === a.y && w.x === Math.min(a.x, b.x)) ||
    (a.x === b.x && w.side === 'down' && w.x === a.x && w.y === Math.min(a.y, b.y)));
  for (const { color, nodes } of solution.paths) {
    assert.ok(endpoints.has(color) && !colors.has(color), 'Unknown or repeated color');
    colors.add(color);
    const pair = endpoints.get(color);
    assert.equal(pair.length, 2);
    assert.ok(nodes.length >= 2 && pair.includes(key(nodes[0])) && pair.includes(key(nodes.at(-1))) && key(nodes[0]) !== key(nodes.at(-1)), 'Changed endpoints');
    nodes.forEach((node, i) => {
      assert.ok(Number.isInteger(node.x) && Number.isInteger(node.y) && node.x >= 0 && node.y >= 0 && node.x < width && node.y < height, 'Invalid coordinate');
      const bridge = bridges.get(`${node.x},${node.y}`);
      assert.ok(bridge ? ['horizontal', 'vertical'].includes(node.lane) : node.lane === 'cell', 'Invalid lane');
      assert.ok(!occupied.has(key(node)), 'Repeated or overlapping node');
      occupied.set(key(node), color);
      if (i && i !== nodes.length - 1) assert.equal(board[node.x][node.y], 0, 'Crossed endpoint');
      if (!i) return;
      const previous = nodes[i - 1];
      const dx = Math.abs(node.x - previous.x), dy = Math.abs(node.y - previous.y);
      const axis = dy === 0 && dx > 0 ? 'horizontal' : dx === 0 && dy > 0 ? 'vertical' : null;
      assert.ok(axis, 'Illegal turn between lanes');
      const ordinary = dx + dy === 1;
      if (ordinary) assert.ok(!wallBlocked(node, previous), 'Crossed wall');
      else {
        assert.equal(mode, 'warps');
        assert.ok(axis === 'horizontal' ? dx === width - 1 : dy === height - 1, 'Illegal warp');
        assert.ok(topology.warps.some(s => s.axis === axis && s.index === (axis === 'horizontal' ? node.y : node.x)), 'Closed seam');
      }
      for (const n of [node, previous]) if (bridges.has(`${n.x},${n.y}`)) assert.equal(n.lane, axis, 'Bridge lane transfer');
    });
  }
  assert.equal(colors.size, endpoints.size, 'Missing color');
  assert.equal(occupied.size, width * height + bridges.size, 'Incomplete coverage');
  for (const b of bridges.values()) {
    assert.notEqual(occupied.get(`${b.x},${b.y},horizontal`), occupied.get(`${b.x},${b.y},vertical`), 'Self-crossing');
  }
}

// Check actual same-color adjacency independently of the selected path steps.
export function assertInducedTopologySolution(fixture, solution) {
  assertTopologySolution(fixture, solution);
  const { width, height, board, topology } = fixture;
  const bridgeCells = new Set(topology.bridges.map(b => `${b.x},${b.y}`));
  const key = n => `${n.x},${n.y},${n.lane}`;
  const occupied = new Map(solution.paths.flatMap(path => path.nodes.map(node => [key(node), path.color])));
  for (const path of solution.paths) for (const node of path.nodes) {
    const neighbors = new Set();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const axis = dx ? 'horizontal' : 'vertical';
      if (node.lane !== 'cell' && node.lane !== axis) continue;
      let x = node.x + dx, y = node.y + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) {
        if (!topology.warps.some(s => s.axis === axis && s.index === (dx ? node.y : node.x))) continue;
        x = (x + width) % width; y = (y + height) % height;
      } else if (topology.walls.some(w => dx
        ? w.side === 'right' && w.y === y && w.x === Math.min(node.x, x)
        : w.side === 'down' && w.x === x && w.y === Math.min(node.y, y))) continue;
      const neighbor = key({ x, y, lane: bridgeCells.has(`${x},${y}`) ? axis : 'cell' });
      if (occupied.get(neighbor) === path.color) neighbors.add(neighbor);
    }
    const expected = node.lane === 'cell' && board[node.x][node.y] ? 1 : 2;
    assert.equal(neighbors.size, expected, `Extra same-color contact at ${key(node)}`);
  }
}

export function decodeNativeSolution(fixture, raw) {
  const { width, height, topology } = fixture;
  const bridges = [...topology.bridges].sort((a, b) => a.y - b.y || a.x - b.x);
  return { version: raw.version, paths: raw.paths.map(path => ({ color: '.RBYGOCMmPAWgTbcp'.indexOf(String.fromCharCode(path.color)), nodes: path.nodes.map(id => {
    if (id >= width * height) return { ...bridges[id - width * height], lane: 'vertical' };
    const x = id % width, y = Math.floor(id / width);
    return { x, y, lane: bridges.some(b => b.x === x && b.y === y) ? 'horizontal' : 'cell' };
  }) })) };
}
