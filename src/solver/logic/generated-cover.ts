import { COLOR_PLACEMENT_ORDER } from './color-order';
import type { PuzzleSolution } from './solution';
import type { topologyGraph } from './topology';

export type CoverGraph = ReturnType<typeof topologyGraph>;
export type CoverRandom = (limit: number) => number;

/** Every open same-color edge must be a consecutive step of the route. */
export function isInducedRoute(path: number[], graph: CoverGraph): boolean {
    const cells = new Set(path);
    return path.every((id, i) => graph.edges[id].filter(n => cells.has(n)).length ===
        (i === 0 || i === path.length - 1 ? 1 : 2));
}

export function splitCover(paths: number[][], graph: CoverGraph, target: number, random: CoverRandom): void {
    while (paths.length < target) {
        const cuts = paths.flatMap((path, index) => Array.from({ length: Math.max(0, path.length - 5) }, (_, i) => i + 3)
            .filter(cut => graph.nodes[path[cut - 1]].lane === 'cell' && graph.nodes[path[cut]].lane === 'cell')
            .map(cut => ({ index, cut })));
        if (!cuts.length) break;
        const { index, cut } = cuts[random(cuts.length)], path = paths[index];
        paths.splice(index, 1, path.slice(0, cut), path.slice(cut));
    }
}

/** Endpoint transfers preserve induced paths, full coverage, and regular dots. */
export function deformCover(paths: number[][], graph: CoverGraph, random: CoverRandom): void {
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
}

export function colorCover(paths: number[][], graph: CoverGraph, random: CoverRandom): PuzzleSolution {
    const colors = COLOR_PLACEMENT_ORDER.slice(0, paths.length);
    shuffle(colors, random);
    return { version: 1, paths: paths.map((path, i) => ({
        color: colors[i], nodes: path.map(id => ({ ...graph.nodes[id] })),
    })) };
}

export function shuffle<T>(values: T[], random: CoverRandom): void {
    for (let i = values.length - 1; i > 0; i--) {
        const j = random(i + 1);
        [values[i], values[j]] = [values[j], values[i]];
    }
}
