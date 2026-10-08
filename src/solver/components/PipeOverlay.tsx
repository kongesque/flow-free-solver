import type { PuzzleSolution } from '../logic/solution';
import type { Bridge, PathNode } from '../logic/topology';
import { COLORS } from './constants';

export default function PipeOverlay({ width, height, solution, bridges }: {
    width: number; height: number; solution: PuzzleSolution | null; bridges: Bridge[];
}) {
    const colors = new Map<string, string>();
    const bridgeCells = new Set(bridges.map(bridge => `${bridge.x},${bridge.y}`));
    for (const path of solution?.paths ?? []) for (const node of path.nodes) colors.set(`${node.x},${node.y},${node.lane}`, COLORS[path.color]);
    // Stop upper-lane segments at the cell edge; the arch draws their crossing.
    const pipePoint = (node: PathNode, toward: PathNode) => {
        const upper = node.lane === 'horizontal' && bridgeCells.has(`${node.x},${node.y}`);
        return [node.x + .5 + (upper ? Math.sign(toward.x - node.x) * .5 : 0), node.y + .5];
    };
    return <svg className="pipe-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {solution?.paths.flatMap(path => path.nodes.slice(1).map((node, i) => {
            const from = path.nodes[i], [x1, y1] = pipePoint(from, node), [x2, y2] = pipePoint(node, from);
            const wrap = Math.abs(node.x - from.x) + Math.abs(node.y - from.y) > 1;
            const d = !wrap ? `M${x1},${y1} L${x2},${y2}` : node.y === from.y
                ? `M${x1},${y1} L${from.x === 0 ? 0 : width},${y1} M${node.x === 0 ? 0 : width},${y2} L${x2},${y2}`
                : `M${x1},${y1} L${x1},${from.y === 0 ? 0 : height} M${x2},${node.y === 0 ? 0 : height} L${x2},${y2}`;
            return <path key={`${path.color}-${i}`} d={d} stroke={COLORS[path.color]} strokeWidth=".28" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
        }))}
        {bridges.map(({ x, y }) => {
            const color = colors.get(`${x},${y},horizontal`);
            return <g key={`${x},${y}`} data-bridge={`${x},${y}`}
                transform={`translate(${x + .5} ${y + .5})`}>
                {color ? <>
                    <path d="M-.27,0 Q0,-.5 .27,0" stroke="#1C1F1E" strokeWidth=".4" fill="none" strokeLinecap="round" />
                    <path d="M-.5,0 H-.27 M-.27,0 Q0,-.5 .27,0 M.27,0 H.5" stroke={color} strokeWidth=".28" fill="none" strokeLinecap="round" />
                </> : <path d="M-.5,0 H-.24 M-.18,-.02 Q0,-.34 .18,-.02 M.24,0 H.5"
                    stroke="#bac4be" strokeWidth=".09" fill="none" strokeLinecap="butt" />}
            </g>;
        })}
    </svg>;
}
