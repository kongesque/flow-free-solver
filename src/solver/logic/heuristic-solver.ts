import type { Board } from './astar-solver';

export const COLOR_CHARS = ['', 'R', 'B', 'Y', 'G', 'O', 'C', 'M', 'm', 'P', 'A', 'W', 'g', 'T', 'b', 'c', 'p'];

interface FlowModule {
  cwrap(name: string, result: 'string', args: ['string']): (input: string) => string;
}

let modulePromise: Promise<FlowModule> | undefined;

export function serializeBoard(board: Board): string {
  const width = board.length;
  const height = board[0]?.length ?? 0;
  if ([width, height].some(dimension => dimension < 2 || dimension > 15) || board.some(column => column.length !== height)) {
    throw new Error('The C solver requires a rectangular board with each dimension between 2 and 15.');
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
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => COLOR_CHARS[board[x][y]] || '.').join('')
  ).join('\n') + '\n';
}

export function parseSolution(result: string, width: number, height = width): Board | null {
  if (result.startsWith('Error: No solution found (result code 1)')) return null;
  if (result.startsWith('Error')) throw new Error(result);
  const rows: unknown = JSON.parse(result);
  if (!Array.isArray(rows) || rows.length !== height || rows.some(row => !Array.isArray(row) || row.length !== width)) {
    throw new Error('Invalid C solver response.');
  }
  return Array.from({ length: width }, (_, x) =>
    Array.from({ length: height }, (_, y) => {
      const color = COLOR_CHARS.indexOf(String.fromCharCode(rows[y][x]));
      if (color < 1) throw new Error('Invalid color in C solver response.');
      return color;
    })
  );
}

export async function solveHeuristicBFS(board: Board): Promise<Board | null> {
  const input = serializeBoard(board);
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
  const module = await modulePromise;
  return parseSolution(module.cwrap('solve_puzzle_wasm', 'string', ['string'])(input), board.length, board[0].length);
}
