import { COLOR_PLACEMENT_ORDER } from './color-order';
import { maxGeneratedPairs } from './puzzle-generator';
import type { PuzzleSolution } from './solution';
import { topologyGraph, type Bridge, type PuzzleTopology } from './topology';

type Random = (limit: number) => number;
type Graph = ReturnType<typeof topologyGraph>;

/** Sparse crossings, with a complete route cover retained throughout construction. */
export function generateBridgeCover(width: number, height: number, random: Random): {
    topology: PuzzleTopology; pathSolution: PuzzleSolution;
} {
    const candidates: Bridge[] = [];
    for (let y = 1; y < height - 1; y++) for (let x = 2; x < width - 2; x++) {
        candidates.push({ x, y, over: 'horizontal' });
    }
    shuffle(candidates, random);
    const wanted = 1 + random(3);
    let bridges: Bridge[] = [];
    for (const candidate of candidates) {
        // Leave two cells between crossings, including diagonal neighbors.
        if (bridges.some(b => Math.max(Math.abs(b.x - candidate.x), Math.abs(b.y - candidate.y)) < 3)) continue;
        bridges.push(candidate);
        if (bridges.length === wanted) break;
    }
    bridges.sort((a, b) => a.y - b.y || a.x - b.x);
    let topology: PuzzleTopology = { walls: [], bridges, warps: [] };
    let graph = topologyGraph(width, height, topology);
    const count = width * height;
    const removed = new Set(bridges.flatMap(b => [(b.y - 1) * width + b.x, (b.y + 1) * width + b.x]));
    const initial: number[][] = [];
    for (let y = 0; y < height; y++) {
        let route: number[] = [];
        for (let x = 0; x < width; x++) {
            const id = y * width + x;
            if (removed.has(id)) {
                if (route.length) initial.push(route);
                route = [];
            } else route.push(id);
        }
        if (route.length) initial.push(route);
    }
    initial.push(...bridges.map((b, i) => [(b.y - 1) * width + b.x, count + i, (b.y + 1) * width + b.x]));
    const maxPairs = maxGeneratedPairs(width, height);
    const minPairs = Math.ceil(Math.min(width, height) / 2);
    const target = minPairs + random(maxPairs - minPairs + 1);
    let paths = initial;
    for (let attempt = 0; attempt < 12; attempt++) {
        const joined = joinRoutes(initial, graph, bridges, width, count, target, random);
        if (joined.length < paths.length) paths = joined;
        if (paths.length <= target) break;
    }
    // A bounded fallback uses one crossing and connected row strips. This
    // avoids rejecting a seed if random joins leave too many isolated ends.
    if (paths.length > maxPairs) {
        bridges = [bridges[0]];
        topology = { walls: [], bridges, warps: [] };
        graph = topologyGraph(width, height, topology);
        const { x, y } = bridges[0];
        const row = (line: number, from = 0, to = width) => Array.from({ length: to - from }, (_, i) => line * width + from + i);
        const rows: number[][] = [];
        for (let line = 0; line < height; line++) {
            if (line === y - 1) rows.push(row(line, x + 1));
            else if (line === y + 1) rows.push(row(line, 0, x));
            else if (line === y) rows.push([...row(y - 1, 0, x).reverse(), ...row(y), ...row(y + 1, x + 1).reverse()]);
            else rows.push(row(line));
        }
        rows.push([(y - 1) * width + x, count, (y + 1) * width + x]);
        paths = joinRoutes(rows, graph, bridges, width, count, maxPairs);
    }
    // Short, wide boards may start with fewer routes than their sampled target.
    // Split only at regular cells so dots can never land on a bridge lane.
    while (paths.length < target) {
        const cuts = paths.flatMap((path, index) => Array.from({ length: Math.max(0, path.length - 5) }, (_, i) => i + 3)
            .filter(cut => graph.nodes[path[cut - 1]].lane === 'cell' && graph.nodes[path[cut]].lane === 'cell')
            .map(cut => ({ index, cut })));
        if (!cuts.length) break;
        const { index, cut } = cuts[random(cuts.length)], path = paths[index];
        paths.splice(index, 1, path.slice(0, cut), path.slice(cut));
    }

    const owner = new Int16Array(graph.nodes.length);
    paths.forEach((path, color) => path.forEach(id => { owner[id] = color; }));
    for (let attempt = 0; attempt < graph.nodes.length * 400; attempt++) {
        const color = random(paths.length), path = paths[color], front = random(2) === 0;
        const end = front ? path[0] : path.at(-1)!;
        const adjacent = graph.edges[end], id = adjacent[random(adjacent.length)];
        const donorColor = owner[id], donor = paths[donorColor];
        if (donorColor === color || donor.length <= 3 || graph.nodes[id].lane !== 'cell') continue;
        const donorFront = donor[0] === id;
        if (!donorFront && donor.at(-1) !== id) continue;
        const next = donorFront ? donor[1] : donor[donor.length - 2];
        if (graph.nodes[next].lane !== 'cell' || graph.edges[id].filter(n => owner[n] === color).length !== 1) continue;
        if (donorFront) donor.shift(); else donor.pop();
        if (front) path.unshift(id); else path.push(id);
        owner[id] = color;
    }
    const colors = COLOR_PLACEMENT_ORDER.slice(0, paths.length);
    shuffle(colors, random);
    return { topology, pathSolution: { version: 1, paths: paths.map((path, i) => ({
        color: colors[i], nodes: path.map(id => ({ ...graph.nodes[id] })),
    })) } };
}

/** Never join routes that occupy opposite lanes of the same crossing. */
function joinRoutes(initial: number[][], graph: Graph, bridges: Bridge[], width: number, count: number, target: number, random?: Random): number[][] {
    const paths = initial.map(path => [...path]);
    const horizontalLanes = bridges.map(b => b.y * width + b.x);
    while (paths.length > target) {
        const masks = paths.map(path => horizontalLanes.reduce((mask, id, i) => mask |
            (path.includes(id) ? 1 << i : 0) |
            (path.includes(count + i) ? 1 << (i + 3) : 0), 0));
        const joins: { a: number; b: number; reverseA: boolean; reverseB: boolean }[] = [];
        for (let a = 0; a < paths.length; a++) for (let b = a + 1; b < paths.length; b++) {
            if (((masks[a] & 7) & (masks[b] >> 3)) || ((masks[b] & 7) & (masks[a] >> 3))) continue;
            for (const reverseA of [false, true]) for (const reverseB of [false, true]) {
                const end = reverseA ? paths[a][0] : paths[a].at(-1)!;
                const start = reverseB ? paths[b].at(-1)! : paths[b][0];
                if (graph.edges[end].includes(start)) joins.push({ a, b, reverseA, reverseB });
            }
        }
        if (!joins.length) break;
        const { a, b, reverseA, reverseB } = joins[random ? random(joins.length) : 0];
        paths[a] = [...(reverseA ? paths[a].reverse() : paths[a]), ...(reverseB ? paths[b].reverse() : paths[b])];
        paths.splice(b, 1);
    }
    return paths;
}

function shuffle<T>(values: T[], random: Random): void {
    for (let i = values.length - 1; i > 0; i--) {
        const j = random(i + 1);
        [values[i], values[j]] = [values[j], values[i]];
    }
}
