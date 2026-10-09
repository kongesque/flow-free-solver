import { bridgeCross } from './topology-puzzles.mjs';

const chars = '.RBYGOCMmPAWgTbcp';
const cell = (x, y) => ({ x, y, lane: 'cell' });
function fixture(width, height, paths, mode, bridges = [], walls = [], warps = []) {
  const board = Array.from({ length: width }, () => Array(height).fill(0));
  const occupied = new Set(paths.flatMap(path => path.nodes.map(n => `${n.x},${n.y}`)));
  const blocks = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!occupied.has(`${x},${y}`)) blocks.push({ x, y });
  }
  for (const path of paths) for (const n of [path.nodes[0], path.nodes.at(-1)]) board[n.x][n.y] = path.color;
  const input = Array.from({ length: height }, (_, y) => board.map((col, x) => occupied.has(`${x},${y}`) ? chars[col[y]] : '#').join('')).join('\n') + '\n';
  return { width, height, board, input, mode, topology: { blocks, walls, bridges, warps }, solution: { version: 1, paths } };
}

// Covers with missing corners, an interior hole, and entirely unused rows.
export function blockRows(width = 5, height = 5, mode = 'standard', rowCount = 5) {
  const paths = [], walls = [], warps = [];
  const activeRows = Math.min(height, rowCount), middle = Math.floor(activeRows / 2);
  let color = 1;
  for (let y = 0; y < activeRows; y++) {
    const start = y === 0 || y === activeRows - 1 ? 1 : 0;
    const end = y === 0 || y === activeRows - 1 ? width - 1 : width;
    const xs = Array.from({ length: end - start }, (_, i) => start + i);
    if (y === middle) {
      const hole = Math.floor(width / 2);
      for (const segment of [xs.filter(x => x < hole), xs.filter(x => x > hole)]) paths.push({ color: color++, nodes: segment.map(x => cell(x, y)) });
    } else if (mode === 'warps' && y === 1) {
      const split = Math.floor(width / 2);
      paths.push({ color: color++, nodes: [...xs.slice(split), ...xs.slice(0, split)].map(x => cell(x, y)) });
      walls.push({ x: split - 1, y, side: 'right' });
      warps.push({ axis: 'horizontal', index: y });
    } else paths.push({ color: color++, nodes: xs.map(x => cell(x, y)) });
  }
  return fixture(width, height, paths, mode, [], walls, warps);
}

// Preserve a real crossing while removing corner pairs and surrounding cells.
export function blockBridge(width = 5, height = 5) {
  const base = bridgeCross(), dx = Math.floor((width - 5) / 2), dy = Math.floor((height - 5) / 2);
  const paths = base.solution.paths.filter(path => !(
    path.nodes.length === 2 && (path.nodes[0].x === 0 && path.nodes[0].y === 0 || path.nodes[0].x === 3 && path.nodes[0].y === 4)
  )).map(path => ({ ...path, nodes: path.nodes.map(n => ({ ...n, x: n.x + dx, y: n.y + dy })) }));
  const bridges = base.topology.bridges.map(b => ({ ...b, x: b.x + dx, y: b.y + dy }));
  return fixture(width, height, paths, 'bridges', bridges);
}

export const blockWire = ({ mode, topology }) => `V1\nMODE,${mode === 'warps' ? 'W' : 'B'}\n` +
  topology.walls.map(w => `W,${w.x},${w.y},${w.side === 'right' ? 'R' : 'D'}\n`).join('') +
  topology.bridges.map(b => `B,${b.x},${b.y},H\n`).join('') +
  topology.warps.map(w => `S,${w.axis === 'horizontal' ? 'H' : 'V'},${w.index}\n`).join('');

// User's 11x11 example: four missing corners and the enclosed center hole.
export function screenshotBlocks() {
  const input = '#Y........#\n...........\n...........\n..C........\n..YG.R.....\n....B#R....\n.....B.....\n...........\n...........\n....O..CO.G\n#.........#\n';
  const rows = input.trim().split('\n'), blocks = [], walls = [];
  const board = Array.from({ length: 11 }, (_, x) => rows.map((row, y) => {
    if (row[x] === '#') { blocks.push({ x, y }); return 0; }
    return chars.indexOf(row[x]);
  }));
  for (const x of [4, 5]) for (const y of [4, 5, 6]) walls.push({ x, y, side: 'right' });
  for (const x of [4, 5, 6]) for (const y of [4, 5]) walls.push({ x, y, side: 'down' });
  return { width: 11, height: 11, input, board, mode: 'standard', topology: { blocks, walls, bridges: [], warps: [] } };
}
