const chars = 'RBY';
const text = cells => [0, 3, 6].map(start => cells.slice(start, start + 3).join('')).join('\n');
const neighbors = id => [id % 3 ? id - 1 : -1, id % 3 < 2 ? id + 1 : -1,
  id >= 3 ? id - 3 : -1, id < 6 ? id + 3 : -1].filter(id => id >= 0);

// Exhaustive oracle over filled color boards, independent of the solver's
// edge traversal, components, pruning and rollback. Derive endpoints only
// from valid induced paths, then canonicalize colors by their first endpoint.
export function smallCovers() {
  const covers = new Set();
  const cells = Array(9).fill(0);
  function visit(id, largest) {
    if (id < 9) {
      for (let color = 0; color <= Math.min(2, largest + 1); color++) {
        cells[id] = color;
        visit(id + 1, Math.max(largest, color));
      }
      return;
    }
    const endpoints = [];
    for (let color = 0; color <= largest; color++) {
      const group = cells.flatMap((c, id) => c === color ? [id] : []);
      const ends = [];
      for (const id of group) {
        const degree = neighbors(id).filter(n => cells[n] === color).length;
        if (degree === 1) ends.push(id);
        else if (degree !== 2) return;
      }
      if (ends.length !== 2) return;
      const seen = new Set([ends[0]]), queue = [ends[0]];
      for (const id of queue) for (const n of neighbors(id)) {
        if (cells[n] === color && !seen.has(n)) { seen.add(n); queue.push(n); }
      }
      if (seen.size !== group.length) return;
      endpoints.push(ends);
    }
    endpoints.sort((a, b) => a[0] - b[0]);
    const puzzle = Array(9).fill('.');
    endpoints.forEach((ends, color) => ends.forEach(id => { puzzle[id] = chars[color]; }));
    covers.add(text(puzzle));
  }
  visit(0, -1);
  return covers;
}


export function smallLayouts() {
  const layouts = new Set();
  function pair(remaining, puzzle, count) {
    if (!remaining.length) { layouts.add(text(puzzle)); return; }
    const [first, ...rest] = remaining;
    for (const last of rest) {
      const next = [...puzzle]; next[first] = next[last] = chars[count];
      pair(rest.filter(id => id !== last), next, count + 1);
    }
  }
  for (let mask = 0; mask < 512; mask++) {
    const endpoints = Array.from({ length: 9 }, (_, id) => id).filter(id => mask & (1 << id));
    if ([2, 4, 6].includes(endpoints.length)) pair(endpoints, Array(9).fill('.'), 0);
  }
  return layouts;
}
