import { readFileSync } from 'node:fs';

// Captured generator seed 16, 19x19 Warps; remove one interior five-cell path
// and wall off two different colors. Retains an independently checked witness
// while exhausting both graph probes and the original native search budget.
export function maskedWarpLimit() {
  const f = JSON.parse(readFileSync(new URL('./puzzles/warps_masked_limit.json', import.meta.url), 'utf8'));
  const rows = f.input.trim().split('\n'), chars = '.RBYGOCMmPAWgTbcp';
  f.board = Array.from({ length: f.width }, (_, x) => rows.map(row => row[x] === '#' ? 0 : chars.indexOf(row[x])));
  return f;
}
