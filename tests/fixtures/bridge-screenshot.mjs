// User screenshot, 2026-10-10: 12 columns × 15 rows, crossings B10/K11.
export function bridgeScreenshot() {
  const width = 12, height = 15;
  const board = Array.from({ length: width }, () => Array(height).fill(0));
  const pairs = [
    [1, [8, 5], [3, 14]], [4, [4, 3], [6, 12]],
    [2, [8, 4], [7, 13]], [3, [2, 2], [1, 13]],
    [5, [11, 0], [9, 5]], [6, [11, 1], [2, 10]],
    [7, [7, 2], [5, 9]], [8, [9, 7], [9, 12]],
    [9, [0, 8], [4, 11]],
  ];
  for (const [color, a, b] of pairs) board[a[0]][a[1]] = board[b[0]][b[1]] = color;
  const chars = '.RBYGOCMmP';
  const input = Array.from({ length: height }, (_, y) => board.map(column => chars[column[y]]).join('')).join('\n') + '\n';
  return { width, height, board, input, mode: 'bridges', topology: {
    walls: [], warps: [], blocks: [],
    bridges: [{ x: 1, y: 9, over: 'horizontal' }, { x: 10, y: 10, over: 'horizontal' }],
  } };
}
