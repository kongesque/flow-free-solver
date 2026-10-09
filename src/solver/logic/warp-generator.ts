import { colorCover, deformCover, splitCover, type CoverRandom } from './generated-cover';
import { maxGeneratedPairs, ringCover } from './puzzle-generator';
import type { PuzzleSolution } from './solution';
import { topologyGraph, type PuzzleTopology } from './topology';

/** Build on a cylinder so wrapping cannot introduce extra same-color edges. */
export function generateWarpCover(width: number, height: number, random: CoverRandom): {
    topology: PuzzleTopology; pathSolution: PuzzleSolution;
} {
    const vertical = random(2) === 0;
    const w = vertical ? height : width, h = vertical ? width : height;
    const paths = ringCover(w, h);
    // Give the opposite sides of the outer ring different colors before
    // opening seams. Otherwise translating that ring creates a tight U.
    const outer = paths.shift()!, cut = h + random(w - 2);
    paths.push(outer.slice(0, cut), outer.slice(cut));
    const graph = topologyGraph(w, h, { walls: [], bridges: [],
        warps: Array.from({ length: h }, (_, index) => ({ axis: 'horizontal', index })) });
    const cap = maxGeneratedPairs(width, height);
    splitCover(paths, graph, paths.length + random(cap - paths.length + 1), random);
    deformCover(paths, graph, random);
    const steps = paths.flatMap(path => path.slice(1).map((id, i) => [graph.nodes[path[i]], graph.nodes[id]])
        .filter(([a, b]) => a.y === b.y));
    const [a, b] = steps[random(steps.length)];
    const shift = Math.abs(a.x - b.x) === w - 1 ? 0 : w - Math.max(a.x, b.x);
    const pathSolution = colorCover(paths, graph, random);
    const seams = new Set<number>();
    for (const path of pathSolution.paths) {
        path.nodes = path.nodes.map(node => ({ ...node, x: (node.x + shift) % w }));
        for (let i = 1; i < path.nodes.length; i++) {
            if (Math.abs(path.nodes[i].x - path.nodes[i - 1].x) > 1) seams.add(path.nodes[i].y);
        }
        if (vertical) path.nodes = path.nodes.map(({ x, y, lane }) => ({ x: y, y: x, lane }));
    }
    return { pathSolution, topology: { walls: [], bridges: [],
        warps: [...seams].map(index => ({ axis: vertical ? 'vertical' : 'horizontal', index })) } };
}
