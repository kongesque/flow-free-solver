import type { TopologyFixture } from './topology-puzzles.mjs';
import type { PuzzleSolution } from '../../src/solver/logic/solution';
export function assertTopologySolution(fixture: TopologyFixture, solution: PuzzleSolution): void;
export function decodeNativeSolution(fixture: TopologyFixture, raw: {version: 1; paths: {color: number; nodes: number[]}[]}): PuzzleSolution;
