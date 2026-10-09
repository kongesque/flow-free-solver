// Manually transcribed endpoints and topology from published game screenshots.
// Color IDs follow the app's palette; rows below are converted to [x][y].
const make = (id, title, level, mode, rows, source, topology = {}) => ({
  id, title, level, mode, source,
  width: rows[0].length, height: rows.length,
  board: Array.from({ length: rows[0].length }, (_, x) => rows.map(row => '.RBYGOCM'.indexOf(row[x]))),
  topology: { walls: [], bridges: [], warps: [], ...topology },
});

export const demoPuzzles = [
  make('classic', 'Classic', '5×5 · Level 12', 'standard', [
    '...RG', '..BG.', 'R....', 'OB.YO', '....Y',
  ], 'https://images.squarespace-cdn.com/content/v1/586beec5e58c624be9f7b5a2/1483734815212-BEB0UXSN3TQGK6PQWZTB/image-asset.png'),
  make('walls', 'Classic with walls', 'Courtyard · 7×7 · Level 1', 'standard', [
    '.......', '.......', 'G.YB...', '...Y...', '.B.....', 'RR.....', 'G......',
  ], 'https://puzzlegamesolutions.blogspot.com/2020/06/flow-courtyard-pack-levels-1-30-7x7.html', {
    walls: [
      ...[1, 2, 4, 5].flatMap(y => [0, 5].map(x => ({ x, y, side: 'right' }))),
      ...[0, 5].flatMap(y => [1, 2, 4, 5].map(x => ({ x, y, side: 'down' }))),
    ],
  }),
  make('bridges', 'Bridges', '5×5 · Level 1', 'bridges', [
    'BY.RO', '.....', '..Y..', '.RO.G', 'BG...',
  ], 'https://images.squarespace-cdn.com/content/v1/586beec5e58c624be9f7b5a2/1483735906665-VOXZDY2LCQAMIWZI1M98/image-asset.png', {
    bridges: [{ x: 2, y: 1, over: 'horizontal' }],
  }),
  make('warps', 'Warps', '5×5 · Level 5', 'warps', [
    'OY...', '.OBRY', '.....', 'CRBG.', '...CG',
  ], 'https://images.squarespace-cdn.com/content/v1/586beec5e58c624be9f7b5a2/1502212905487-K600971JQS1I04S1UW2U/image-asset.png', {
    warps: [{ axis: 'horizontal', index: 2 }],
  }),
];
