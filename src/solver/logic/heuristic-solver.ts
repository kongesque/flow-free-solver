import { MAX_BOARD_SIZE } from './board-limits';
import type { Board } from './astar-solver';
import { normalizeWalls, type Wall } from './walls';
import { normalizeTopology, topologyGraph, type PuzzleTopology } from './topology';
import { validateSolution, type PuzzleSolution } from './solution';
import type { GameMode } from './game-modes';
import { SearchLimitError } from './solver-errors';
import { blockKey, normalizeBlocks, type Block } from './blocks';

export const COLOR_CHARS = ['', 'R', 'B', 'Y', 'G', 'O', 'C', 'M', 'm', 'P', 'A', 'W', 'g', 'T', 'b', 'c', 'p'];

interface FlowModule {
  cwrap(name: string, result: 'string', args: string[]): (...input: string[]) => string;
}

let modulePromise: Promise<FlowModule> | undefined;

export function serializeBoard(board: Board, blocks: Block[] = []): string {
  const width = board.length;
  const height = board[0]?.length ?? 0;
  if ([width, height].some(dimension => dimension < 2 || dimension > MAX_BOARD_SIZE) || board.some(column => column.length !== height)) {
    throw new Error(`The C solver requires a rectangular board with each dimension between 2 and ${MAX_BOARD_SIZE}.`);
  }
  const counts = new Map<number, number>();
  for (const value of board.flat()) {
    if (!Number.isInteger(value) || value < 0 || value >= COLOR_CHARS.length) {
      throw new Error('Invalid board color.');
    }
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  if (!counts.size || [...counts.values()].some(count => count !== 2)) {
    throw new Error('Each color must have exactly two endpoints.');
  }
  const blocked = new Set(normalizeBlocks(blocks, board).map(blockKey));
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => blocked.has(`${x},${y}`) ? '#' : COLOR_CHARS[board[x][y]] || '.').join('')
  ).join('\n') + '\n';
}

export function parseSolution(result: string, width: number, height = width, blocks: Block[] = []): Board | null {
  if (result.startsWith('Error: No solution found (result code 1)')) return null;
  if (result === 'Error: No solution found (result code 2)') throw new SearchLimitError();
  if (result.startsWith('Error')) throw new Error(result);
  const rows: unknown = JSON.parse(result);
  if (!Array.isArray(rows) || rows.length !== height || rows.some(row => !Array.isArray(row) || row.length !== width)) {
    throw new Error('Invalid C solver response.');
  }
  const blocked = new Set(blocks.map(blockKey));
  return Array.from({ length: width }, (_, x) =>
    Array.from({ length: height }, (_, y) => {
      if (blocked.has(`${x},${y}`)) {
        if (rows[y][x] !== 0) throw new Error('C solver filled a blocked cell.');
        return 0;
      }
      const color = COLOR_CHARS.indexOf(String.fromCharCode(rows[y][x]));
      if (color < 1) throw new Error('Invalid color in C solver response.');
      return color;
    })
  );
}

export function serializeWalls(walls: readonly Wall[], width: number, height: number): string {
  return normalizeWalls(walls, width, height)
    .map(({ x, y, side }) => `${x},${y},${side === 'right' ? 'R' : 'D'}\n`).join('');
}

async function loadModule(): Promise<FlowModule> {
  if (!modulePromise) {
    const url = new URL(`${import.meta.env.BASE_URL}wasm/flow_solver_c.mjs`, self.location.origin).href;
    // Absolute URLs also keep Vite's dev import helper from adding ?import to
    // this public asset, which must be served without source transforms.
    modulePromise = import(/* @vite-ignore */ url)
      .then(({ default: createFlowSolver }) => createFlowSolver({
        locateFile: (name: string) => `${import.meta.env.BASE_URL}wasm/${name}`,
      }))
      .catch(error => { modulePromise = undefined; throw error; });
  }
  return modulePromise;
}

export async function solveHeuristicBFS(board: Board, walls: Wall[] = [], blocks: Block[] = []): Promise<Board | null> {
  const input = serializeBoard(board, blocks);
  const wallInput = serializeWalls(walls, board.length, board[0].length);
  const module = await loadModule();
  const result = wallInput
    ? module.cwrap('solve_puzzle_with_walls_wasm', 'string', ['string', 'string'])(input, wallInput)
    : module.cwrap('solve_puzzle_wasm', 'string', ['string'])(input);
  return parseSolution(result, board.length, board[0].length, blocks);
}

export function serializeTopology(topology: PuzzleTopology, mode: GameMode): string {
  if (mode !== 'warps' && mode !== 'bridges') throw new Error('Invalid variant mode');
  return `V1\nMODE,${mode === 'warps' ? 'W' : 'B'}\n` +
    topology.walls.map(({ x, y, side }) => `W,${x},${y},${side === 'right' ? 'R' : 'D'}\n`).join('') +
    topology.bridges.map(({ x, y, over }) => `B,${x},${y},${over === 'horizontal' ? 'H' : 'V'}\n`).join('') +
    topology.warps.map(({ axis, index }) => `S,${axis === 'horizontal' ? 'H' : 'V'},${index}\n`).join('');
}

export function parseTopologySolution(result: string, board: Board, topology: PuzzleTopology): {
  status: 'solved' | 'unsatisfiable' | 'limit'; solution: PuzzleSolution | null; nodeCount: number;
} {
  const raw = JSON.parse(result);
  if (raw?.version !== 1 || !['solved', 'unsatisfiable', 'limit'].includes(raw.status)) throw new Error('Invalid C topology response');
  if (raw.status !== 'solved') return { status: raw.status, solution: null, nodeCount: raw.nodeCount ?? 0 };
  const { nodes } = topologyGraph(board.length, board[0].length, topology);
  if (!Array.isArray(raw.paths) || raw.paths.length > 16) throw new Error('Invalid C paths');
  const solution: PuzzleSolution = { version: 1, paths: raw.paths.map((path: { color: number; nodes: number[] }) => {
    if (!Array.isArray(path?.nodes) || path.nodes.length > nodes.length) throw new Error('Invalid C path');
    const color = COLOR_CHARS.indexOf(String.fromCharCode(path.color));
    return { color, nodes: path.nodes.map(id => {
      if (!Number.isInteger(id) || !nodes[id]) throw new Error('Invalid C path node');
      return nodes[id];
    }) };
  }) };
  validateSolution(board, topology, solution);
  return { status: 'solved', solution, nodeCount: raw.nodeCount ?? 0 };
}

export async function solveTopology(board: Board, input: unknown, mode: GameMode) {
  const topology = normalizeTopology(input, board, mode);
  const boardText = serializeBoard(board, topology.blocks);
  const topologyText = serializeTopology(topology, mode);
  const module = await loadModule();
  const result = module.cwrap('solve_puzzle_topology_wasm', 'string', ['string', 'string'])(boardText, topologyText);
  return parseTopologySolution(result, board, topology);
}
