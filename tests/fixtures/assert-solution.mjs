import assert from 'node:assert/strict';

// Check the puzzle's rules independently of any solver's search implementation.
export function assertSolution(input, solution) {
  const rows = input.trim().split(/\r?\n/);
  const size = rows.length;
  assert.equal(solution.length, size);
  const endpoints = new Map();
  for (let y = 0; y < size; y++) {
    assert.equal(solution[y].length, size);
    for (let x = 0; x < size; x++) {
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
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const code = solution[y][x];
      assert.ok(endpoints.has(String.fromCharCode(code)), 'Unknown color');
      const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .filter(([nx, ny]) => solution[ny]?.[nx] === code);
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
        if (solution[ny]?.[nx] === color.charCodeAt(0)) queue.push([nx, ny]);
      }
    }
    const count = solution.flat().filter(code => code === color.charCodeAt(0)).length;
    assert.equal(seen.size, count, `Disconnected path for ${color}`);
    assert.ok(seen.has(points[1].join(',')), `Disconnected endpoints for ${color}`);
  }
}
