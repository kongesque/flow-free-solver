// User's 19x19 Bridges screenshot, 2026-10-11. All crossings go over horizontally.
export function bridgesSafariScreenshot() {
  const width = 19, height = 19;
  const board = Array.from({ length: width }, () => Array(height).fill(0));
  const pairs = [
    [[2, 1], [17, 12]], [[12, 7], [10, 10]], [[13, 7], [4, 14]],
    [[6, 9], [5, 15]], [[15, 4], [6, 15]], [[6, 3], [2, 4]],
    [[13, 8], [9, 9]], [[3, 5], [3, 16]], [[2, 2], [16, 10]],
    [[9, 3], [4, 12]], [[4, 5], [6, 16]], [[12, 6], [1, 18]],
    [[17, 0], [2, 18]], [[3, 2], [10, 3]],
  ];
  pairs.forEach((pair, index) => pair.forEach(([x, y]) => { board[x][y] = index + 1; }));
  const chars = '.RBYGOCMmPAWgTbcp';
  const input = Array.from({ length: height }, (_, y) => board.map(column => chars[column[y]]).join('')).join('\n') + '\n';
  return { width, height, board, input, mode: 'bridges', topology: {
    blocks: [], walls: [], warps: [],
    bridges: [{ x: 15, y: 2, over: 'horizontal' }, { x: 8, y: 5, over: 'horizontal' }, { x: 7, y: 15, over: 'horizontal' }],
  } };
}
