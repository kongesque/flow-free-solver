const chars = '.RBYGOCMmPAWgTbcp';
const cell = (x, y, lane = 'cell') => ({ x, y, lane });
function fixture(width, height, paths, topology, mode) {
  const board = Array.from({ length: width }, () => Array(height).fill(0));
  for (const { color, nodes } of paths) for (const node of [nodes[0], nodes.at(-1)]) board[node.x][node.y] = color;
  const input = Array.from({ length: height }, (_, y) => board.map(column => chars[column[y]]).join('')).join('\n') + '\n';
  return { width, height, board, input, topology, mode, solution: { version: 1, paths } };
}

// Each isolated row is split at its center; its endpoints require a warp.
export function warpRows(width = 5, height = 5, vertical = false) {
  const paths = [], walls = [], warps = [];
  for (let y = 0; y < height; y++) {
    const nodes = [];
    const split = Math.floor(width / 2);
    for (let x = split; x < width; x++) nodes.push(cell(x, y));
    for (let x = 0; x < split; x++) nodes.push(cell(x, y));
    paths.push({ color: y + 1, nodes });
    walls.push({ x: split - 1, y, side: 'right' });
    warps.push({ axis: 'horizontal', index: y });
    if (y < height - 1) for (let x = 0; x < width; x++) walls.push({ x, y, side: 'down' });
  }
  if (vertical) {
    for (const path of paths) for (const node of path.nodes) [node.x, node.y] = [node.y, node.x];
    for (const wall of walls) { [wall.x, wall.y] = [wall.y, wall.x]; wall.side = wall.side === 'right' ? 'down' : 'right'; }
    for (const seam of warps) seam.axis = 'vertical';
    [width, height] = [height, width];
  }
  return fixture(width, height, paths, { walls, warps, bridges: [] }, 'warps');
}

// A single forced snake with a used seam on every row, including the last.
export function warpSnake(size = 19) {
  const nodes = [], walls = [], warps = [];
  const split = Math.floor(size / 2);
  for (let y = 0; y < size; y++) {
    const xs = Array.from({ length: size }, (_, i) => (split + i) % size);
    if (y % 2) xs.reverse();
    nodes.push(...xs.map(x => cell(x, y)));
    walls.push({ x: split - 1, y, side: 'right' });
    warps.push({ axis: 'horizontal', index: y });
    if (y < size - 1) for (let x = 0; x < size; x++) {
      if (x !== xs.at(-1)) walls.push({ x, y, side: 'down' });
    }
  }
  return fixture(size, size, [{ color: 1, nodes }], { walls, warps, bridges: [] }, 'warps');
}

// Synthetic crossing: vertical center lane + middle row, short disjoint pairs
// on either side. No official puzzle data is included.
export function bridgeCross(adjacent = false, over = 'horizontal') {
  const width = adjacent ? 6 : 5, height = 5, mid = 2;
  const bridges = [cell(2, mid), ...(adjacent ? [cell(3, mid)] : [])].map(({ x, y }) => ({ x, y, over }));
  const paths = [];
  let color = 1;
  for (const { x } of bridges) paths.push({ color: color++, nodes: Array.from({ length: height }, (_, y) => cell(x, y, y === mid ? 'vertical' : 'cell')) });
  paths.push({ color: color++, nodes: Array.from({ length: width }, (_, x) => cell(x, mid, bridges.some(b => b.x === x) ? 'horizontal' : 'cell')) });
  for (let y = 0; y < height; y++) if (y !== mid) {
    paths.push({ color: color++, nodes: [cell(0, y), cell(1, y)] });
    paths.push({ color: color++, nodes: [cell(width - 2, y), cell(width - 1, y)] });
  }
  return fixture(width, height, paths, { walls: [], warps: [], bridges }, 'bridges');
}

export function largeBridgeCover(size = 15) {
  const width = size, height = size, bridges = [];
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) bridges.push({ x, y, over: 'horizontal' });
  const horizontal = [cell(0, 1)], vertical = [cell(1, 0)];
  for (let y = 1; y < size - 1; y++) {
    const xs = Array.from({ length: size - 2 }, (_, i) => y % 2 ? i + 1 : size - 2 - i);
    horizontal.push(...xs.map(x => cell(x, y, 'horizontal')));
    if (y < size - 2) horizontal.push(cell(y % 2 ? size - 1 : 0, y), cell(y % 2 ? size - 1 : 0, y + 1));
  }
  horizontal.push(cell(size - 1, size - 2));
  for (let x = 1; x < size - 1; x++) {
    const ys = Array.from({ length: size - 2 }, (_, i) => x % 2 ? i + 1 : size - 2 - i);
    vertical.push(...ys.map(y => cell(x, y, 'vertical')));
    if (x < size - 2) vertical.push(cell(x, x % 2 ? size - 1 : 0), cell(x + 1, x % 2 ? size - 1 : 0));
  }
  vertical.push(cell(size - 2, size - 1));
  const hCut = horizontal.findIndex(n => n.x === size - 1 && n.y === 1) + 1;
  const vCut = vertical.findIndex(n => n.x === 1 && n.y === size - 1) + 1;
  const paths = [
    { color: 1, nodes: [cell(0, 0), ...horizontal.slice(0, hCut), cell(size - 1, 0)] },
    { color: 2, nodes: [...horizontal.slice(hCut), cell(size - 1, size - 1)] },
    { color: 3, nodes: [...vertical.slice(0, vCut), cell(0, size - 1)] },
    { color: 4, nodes: vertical.slice(vCut) },
  ];
  const chosen = new Set(paths.flatMap(p => p.nodes.slice(1).map((n, i) =>
    [p.nodes[i].y * width + p.nodes[i].x, n.y * width + n.x].sort((a, b) => a - b).join(':'))));
  const walls = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (const [dx, dy, side] of [[1, 0, 'right'], [0, 1, 'down']]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= width || ny >= height || bridges.some(b => b.x === x && b.y === y || b.x === nx && b.y === ny)) continue;
    if (!chosen.has([y * width + x, ny * width + nx].sort((a, b) => a - b).join(':'))) walls.push({ x, y, side });
  }
  return fixture(width, height, paths, { walls, bridges, warps: [] }, 'bridges');
}
