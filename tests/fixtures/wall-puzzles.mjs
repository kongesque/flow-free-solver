/** A forced snake covering every cell, with alternating openings between rows. */
export function wallCorridor(width = 5, height = 5) {
  const rows = Array.from({ length: height }, () => Array(width).fill('.'));
  rows[0][0] = 'R';
  rows[height - 1][height % 2 ? width - 1 : 0] = 'R';
  const walls = [];
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== (y % 2 ? 0 : width - 1)) walls.push({ x, y, side: 'down' });
    }
  }
  return { input: rows.map(row => row.join('')).join('\n') + '\n', walls };
}

// Adjacent red endpoints are separated by a wall and must route around it.
export const wallDetour = {
  input: 'R....\nR....\nB...B\nY...Y\nG...G\n',
  walls: Array.from({ length: 4 }, (_, x) => ({ x, y: 0, side: 'down' })),
};

export const wallText = walls => walls.map(({ x, y, side }) => `${x},${y},${side === 'right' ? 'R' : 'D'}\n`).join('');
