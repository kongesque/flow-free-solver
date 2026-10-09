import assert from 'node:assert/strict';

// Check the puzzle's rules independently of any solver's search implementation.
export function assertSolution(input, solution, walls = []) {
  const rows = input.trim().split(/\r?\n/);
  const height = rows.length;
  const width = rows[0].length;
  const blocked = new Set();
  const edgeKey = (x, y, nx, ny) => [y * width + x, ny * width + nx].sort((a, b) => a - b).join(':');
  for (const { x, y, side } of walls) {
    assert.ok(Number.isInteger(x) && Number.isInteger(y) && (side === 'right' || side === 'down'), 'Invalid wall');
    const nx = x + (side === 'right' ? 1 : 0), ny = y + (side === 'down' ? 1 : 0);
    assert.ok(x >= 0 && y >= 0 && nx < width && ny < height, 'Wall outside board');
    blocked.add(edgeKey(x, y, nx, ny));
  }
  const connected = (x, y, nx, ny) => !blocked.has(edgeKey(x, y, nx, ny));
  assert.ok(rows.every(row => row.length === width), 'Ragged puzzle');
  assert.equal(solution.length, height);
  const endpoints = new Map();
  for (let y = 0; y < height; y++) {
    assert.equal(solution[y].length, width);
    for (let x = 0; x < width; x++) {
      if (rows[y][x] === '#') {
        assert.equal(solution[y][x], 0, `Filled blocked cell at ${x},${y}`);
        continue;
      }
      const color = String.fromCharCode(solution[y][x]);
      assert.notEqual(color, '\0', `Empty cell at ${x},${y}`);
      if (rows[y][x] !== '.') {
        assert.equal(color, rows[y][x], `Changed endpoint at ${x},${y}`);
        const points = endpoints.get(color) ?? [];
        points.push([x, y]);
        endpoints.set(color, points);
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y][x] === '#') continue;
      const code = solution[y][x];
      assert.ok(endpoints.has(String.fromCharCode(code)), 'Unknown color');
      const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .filter(([nx, ny]) => solution[ny]?.[nx] === code && connected(x, y, nx, ny));
      assert.equal(neighbors.length, rows[y][x] === '.' ? 2 : 1, `Invalid path degree at ${x},${y}`);
    }
  }
  for (const [color, points] of endpoints) {
    assert.equal(points.length, 2);
    const seen = new Set();
    const queue = [points[0]];
    while (queue.length) {
      const [x, y] = queue.pop();
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (solution[ny]?.[nx] === color.charCodeAt(0) && connected(x, y, nx, ny)) queue.push([nx, ny]);
      }
    }
    const count = solution.flat().filter(code => code === color.charCodeAt(0)).length;
    assert.equal(seen.size, count, `Disconnected path for ${color}`);
    assert.ok(seen.has(points[1].join(',')), `Disconnected endpoints for ${color}`);
  }
}
