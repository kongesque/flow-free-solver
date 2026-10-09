import { colorCover, deformCover, isInducedRoute, shuffle, splitCover, type CoverGraph, type CoverRandom } from './generated-cover';
import { maxGeneratedPairs, ringCover } from './puzzle-generator';
import type { PuzzleSolution } from './solution';
import { topologyGraph, type Bridge, type PuzzleTopology } from './topology';

/** Add sparse crossings to an induced cover rather than joining touching rows. */
export function generateBridgeCover(width: number, height: number, random: CoverRandom): {
    topology: PuzzleTopology; pathSolution: PuzzleSolution;
} {
    const topology: PuzzleTopology = { walls: [], bridges: [], warps: [] };
    let graph = topologyGraph(width, height, topology);
    let paths = ringCover(width, height);
    const candidates: Bridge[] = [];
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        candidates.push({ x, y, over: 'horizontal' });
    }
    shuffle(candidates, random);
    const wanted = 1 + random(3), cap = maxGeneratedPairs(width, height);
    for (const bridge of candidates) {
        if (topology.bridges.some(b => Math.max(Math.abs(b.x - bridge.x), Math.abs(b.y - bridge.y)) < 3)) continue;
        const horizontal = bridge.y * width + bridge.x;
        const route = paths.find(path => path.includes(horizontal))!;
        const position = route.indexOf(horizontal);
        if (position === 0 || position === route.length - 1 ||
            ![route[position - 1], route[position + 1]].every(id => graph.nodes[id].y === bridge.y)) continue;
        const up = horizontal - width, down = horizontal + width;
        const a = paths.findIndex(path => path.includes(up)), b = paths.findIndex(path => path.includes(down));
        if (a === b || paths[a] === route || paths[b] === route) continue;
        const nextTopology = { ...topology, bridges: [...topology.bridges, bridge] };
        const nextGraph = topologyGraph(width, height, nextTopology);
        const vertical = nextGraph.nodes.length - 1;
        const options: number[][][] = [];
        for (const upper of endpointPieces(paths[a], up, graph)) for (const lower of endpointPieces(paths[b], down, graph)) {
            const joined = [...upper.end, vertical, ...lower.end.toReversed()];
            if (!isInducedRoute(joined, nextGraph) || nextTopology.bridges.some((crossing, i) =>
                joined.includes(crossing.y * width + crossing.x) && joined.includes(width * height + i))) continue;
            const candidate = paths.filter((_, i) => i !== a && i !== b);
            if (upper.rest.length) candidate.push(upper.rest);
            if (lower.rest.length) candidate.push(lower.rest);
            candidate.push(joined);
            if (candidate.length <= cap) options.push(candidate);
        }
        if (!options.length) continue;
        paths = options[random(options.length)];
        topology.bridges.push(bridge);
        graph = nextGraph;
        if (topology.bridges.length === wanted) break;
    }
    if (!topology.bridges.length) throw new Error('Could not construct an induced bridge cover');
    const target = paths.length + random(cap - paths.length + 1);
    splitCover(paths, graph, target, random);
    deformCover(paths, graph, random);
    return { topology, pathSolution: colorCover(paths, graph, random) };
}

/** Cut a route at a regular cell, retaining regular endpoints on both pieces. */
function endpointPieces(path: number[], id: number, graph: CoverGraph): { end: number[]; rest: number[] }[] {
    const index = path.indexOf(id);
    return [
        { end: path.slice(0, index + 1), rest: path.slice(index + 1) },
        { end: path.slice(index).toReversed(), rest: path.slice(0, index) },
    ].filter(({ end, rest }) => end.length >= 2 &&
        (!rest.length || rest.length >= 2 && graph.nodes[rest[0]].lane === 'cell' && graph.nodes[rest.at(-1)!].lane === 'cell'));
}
