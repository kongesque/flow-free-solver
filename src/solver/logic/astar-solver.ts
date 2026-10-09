import { normalizeBlocks, type Block } from './blocks';
export type Cell = [number, number];
export type Board = number[][];

const directions: Cell[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

class MinHeap<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  push(item: T) {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0 && bottom !== undefined) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  get length() {
    return this.heap.length;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compare(this.heap[index], this.heap[parentIndex]) < 0) {
        [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  private bubbleDown(index: number) {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < this.heap.length && this.compare(this.heap[leftChild], this.heap[smallest]) < 0) {
        smallest = leftChild;
      }
      if (rightChild < this.heap.length && this.compare(this.heap[rightChild], this.heap[smallest]) < 0) {
        smallest = rightChild;
      }
      if (smallest !== index) {
        [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
        index = smallest;
      } else {
        break;
      }
    }
  }
}

class Queue<T> {
  private items: Record<number, T> = {};
  private head = 0;
  private tail = 0;

  push(item: T) {
    this.items[this.tail] = item;
    this.tail++;
  }

  shift(): T | undefined {
    if (this.head === this.tail) {
      return undefined;
    }
    const item = this.items[this.head];
    delete this.items[this.head];
    this.head++;
    return item;
  }

  get length() {
    return this.tail - this.head;
  }
}

const findPairs = (board: Board, number: number): [Cell | null, Cell | null] => {
  let startCell: Cell | null = null;
  let endCell: Cell | null = null;
  for (let i = 0; i < board.length; i++) {
    for (let j = 0; j < board[i].length; j++) {
      if (board[i][j] === number) {
        if (startCell === null) {
          startCell = [i, j];
        } else {
          endCell = [i, j];
          return [startCell, endCell];
        }
      }
    }
  }
  return [startCell, endCell];
}

const aStar = (board: Board, start: Cell, end: Cell): number => {
  const n = board.length;
  // flat array might be faster? whatever n is small enough
  const visited: boolean[][] = Array(n).fill(null).map(() => Array(n).fill(false));

  // [f, g, x, y]
  // dont need full path here, just distance

  const pq = new MinHeap<[number, number, number, number]>((a, b) => a[0] - b[0]);
  pq.push([0, 0, start[0], start[1]]);

  visited[start[0]][start[1]] = true;

  while (pq.length > 0) {
    const [f, g, x, y] = pq.pop()!;

    if (x === end[0] && y === end[1]) {
      return g;
    }

    // standard a* visited check
    // optimized logic from previous ver

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (nx >= 0 && nx < n && ny >= 0 && ny < n && !visited[nx][ny]) {
        if (nx === end[0] && ny === end[1]) {
          return g + 1;
        }
        if (board[nx][ny] === 0) {
          visited[nx][ny] = true;
          const gNew = g + 1;
          const hNew = Math.abs(nx - end[0]) + Math.abs(ny - end[1]);
          const fNew = gNew + hNew;
          pq.push([fNew, gNew, nx, ny]);
        }
      }
    }
  }

  return Infinity;
}

const applyPath = (board: Board, path: Cell[], number: number): Board => {
  const newBoard = board.map(row => [...row]);
  for (const [x, y] of path) {
    newBoard[x][y] = number;
  }
  return newBoard;
}

const lookaheadHeuristics = (board: Board, pairs: Record<number, [Cell | null, Cell | null]>, currentNumber: number): number | null => {
  for (let number = currentNumber; number <= Object.keys(pairs).length; number++) {
    const [startCell, endCell] = pairs[number];
    if (startCell && endCell) {
      const minDist = aStar(board, startCell, endCell);
      if (minDist === Infinity) {
        return Infinity;
      }
    }
  }
  return null;
}

const explorePathsForNumber = (
  board: Board,
  sumPath: number,
  number: number,
  pairs: Record<number, [Cell | null, Cell | null]>,
  nodeCount: number,
  startTime: number,
  timeout: number,
  playableCells: number
): [Board | null, number] => {
  if (!pairs[number])
    throw new Error(`No Solution Exists`);

  const [startCell, endCell] = pairs[number];
  if (!startCell || !endCell) return [null, nodeCount];

  const minDist = aStar(board, startCell, endCell);
  if (minDist === Infinity) return [null, nodeCount];

  const lookAhead = lookaheadHeuristics(board, pairs, number + 1);
  if (lookAhead === Infinity) return [null, nodeCount];

  // BFS Queue: [x, y, path]
  const queue = new Queue<[number, number, Cell[]]>();
  queue.push([startCell[0], startCell[1], [startCell]]);

  // bfs to find all valid paths for this color
  // visitedPaths ensures we dont loop infintely or repeat same work
  // kinda messy but it works

  const visitedPaths = new Set<string>();

  while (queue.length > 0) {
    if (performance.now() - startTime > timeout) {
      throw new Error('Timeout Exceeded');
    }

    const current = queue.shift()!;
    const [cx, cy, path] = current;

    // If reached end
    if (cx === endCell[0] && cy === endCell[1]) {
      if (minDist <= path.length) {
        // only check duplication when we hit the end
        // bfs order guarantees we see shorter paths first usuallly

        const pathTuple = JSON.stringify(path);
        if (!visitedPaths.has(pathTuple)) {
          visitedPaths.add(pathTuple);
          const boardCopy = board.map(row => [...row]);
          const newBoard = applyPath(boardCopy, path, number);

          nodeCount++;

          const nextNum = number + 1;
          // If nextNum exists (aka number < maxNum)
          // The original code check `if (nextNum)` is effectively `if (true)` unless number is 0?
          // Actually `pairs` has keys 1...N.

          if (pairs[nextNum]) {
            const newSumPath = sumPath + path.length;
            if (newSumPath === playableCells) {
              return [newBoard, nodeCount];
            }

            const [result, newNodeCount] = explorePathsForNumber(newBoard, newSumPath, nextNum, pairs, nodeCount, startTime, timeout, playableCells);
            nodeCount = newNodeCount;

            if (result) {
              return [result, nodeCount];
            }
          } else {
            // All numbers done?
            // If we are at the last number.
            // Check if board is full?
            const newSumPath = sumPath + path.length;
            if (newSumPath === playableCells) {
              return [newBoard, nodeCount];
            }
            // If board not full but all numbers connected, is it solved?
            // Flow Free requires all cells filled.
          }
        }
      }
      continue; // Don't extend paths from the endpoint
    }

    for (const [dx, dy] of directions) {
      const nx = cx + dx;
      const ny = cy + dy;

      // Check bounds
      if (nx >= 0 && nx < board.length && ny >= 0 && ny < board[0].length) {
        // cycle check. O(path_length) but path is short
        // < 100 usually so its fine

        let inPath = false;
        for (let i = 0; i < path.length; i++) {
          if (path[i][0] === nx && path[i][1] === ny) {
            inPath = true;
            break;
          }
        }
        if (inPath) continue;

        const isEnd = (nx === endCell[0] && ny === endCell[1]);
        if (board[nx][ny] === 0 || isEnd) {
          // A matrix solution must form one unbranched path per color.
          // Once beside the endpoint, finish there; don't pass it and create
          // a second connection later. Reject touches to earlier path cells.
          const besideEnd = Math.abs(cx - endCell[0]) + Math.abs(cy - endCell[1]) === 1;
          if (besideEnd && !isEnd) continue;
          if (path.some(([x, y], i) => i < path.length - 1 && Math.abs(nx - x) + Math.abs(ny - y) === 1)) continue;

          queue.push([nx, ny, [...path, [nx, ny]]]);
        }
      }
    }
  }

  return [null, nodeCount];
}

const solveBoard = (board: Board): [Board | null, number, number] => {
  const startTime = performance.now();
  const pairs: Record<number, [Cell | null, Cell | null]> = {};
  let sumPath = 0;

  // Use proper types
  const maxNum = Math.max(...board.flat());

  // Validate all pairs function
  for (let number = 1; number <= maxNum; number++) {
    pairs[number] = findPairs(board, number);
    if (!pairs[number][0] || !pairs[number][1]) {
      // missing pair = invalid board.
      // strict check
      throw new Error(`Number ${number} does not have a pair`);
    }
  }

  const playableCells = board.flat().filter(value => value !== -1).length;
  const firstNum = 1;
  let nodeCount = 0;

  try {
    const [finalBoard, finalNodeCount] = explorePathsForNumber(board, sumPath, firstNum, pairs, nodeCount, startTime, 15000, playableCells); // 15s timeout
    const endTime = performance.now();
    return [finalBoard, finalNodeCount, endTime - startTime];
  } catch (e: any) {
    return [null, nodeCount, performance.now() - startTime];
  }
}

export type SolveResult = {
  board: Board | null;
  timedOut: boolean;
  timeTaken: number;
  nodeCount: number;
};

export const solve = (board: any, blocks: Block[] = []): SolveResult => {
  try {
    // Validate input board
    if (!board || board.length === 0) {
      return { board: null, timedOut: false, timeTaken: 0, nodeCount: 0 };
    }

    // Ensure board is number[][]
    // The component passes number[][] so it's fine.

    // Palette IDs are stable but need not be consecutive (A/B/C use 1/4/2).
    // The search indexes pairs from 1..N, then restores the original colors.
    const colors = [...new Set<number>((board as Board).flat())].filter(Boolean).sort((a, b) => a - b);
    const indices = new Map(colors.map((color, i) => [color, i + 1]));
    const indexedBoard = (board as Board).map(column => column.map(color => indices.get(color) ?? 0));
    for (const { x, y } of normalizeBlocks(blocks, board)) indexedBoard[x][y] = -1;
    const [indexedSolution, finalNodeCount, timeTaken] = solveBoard(indexedBoard);
    const solvedBoard = indexedSolution?.map(column => column.map(index => index === -1 ? 0 : colors[index - 1])) ?? null;
    const timedOut = solvedBoard === null && timeTaken >= 14900; // ~15s timeout
    console.log(`Solved in ${timeTaken.toFixed(2)}ms, nodes: ${finalNodeCount}`);
    return { board: solvedBoard, timedOut, timeTaken, nodeCount: finalNodeCount };
  } catch (error: any) {
    console.error(error);
    return { board: null, timedOut: false, timeTaken: 0, nodeCount: 0 };
  }
};
