import type { PuzzleSolution } from '../logic/solution';
import type { Bridge } from '../logic/topology';
import { COLORS } from './constants';

export default function PipeOverlay({ width, height, solution, bridges }: {
    width: number; height: number; solution: PuzzleSolution | null; bridges: Bridge[];
}) {
    const colors = new Map<string, string>();
    for (const path of solution?.paths ?? []) for (const node of path.nodes) colors.set(`${node.x},${node.y},${node.lane}`, COLORS[path.color]);
    return <svg className="pipe-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {solution?.paths.flatMap(path => path.nodes.slice(1).map((node, i) => {
            const from = path.nodes[i], x1 = from.x + .5, y1 = from.y + .5, x2 = node.x + .5, y2 = node.y + .5;
            const wrap = Math.abs(node.x - from.x) + Math.abs(node.y - from.y) > 1;
            const d = !wrap ? `M${x1},${y1} L${x2},${y2}` : node.y === from.y
                ? `M${x1},${y1} L${from.x === 0 ? 0 : width},${y1} M${node.x === 0 ? 0 : width},${y2} L${x2},${y2}`
                : `M${x1},${y1} L${x1},${from.y === 0 ? 0 : height} M${x2},${node.y === 0 ? 0 : height} L${x2},${y2}`;
            return <path key={`${path.color}-${i}`} d={d} stroke={COLORS[path.color]} strokeWidth=".28" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
        }))}
        {bridges.map(({ x, y, over }) => {
            const horizontal = over === 'horizontal';
            const d = horizontal ? `M${x},${y + .5} L${x + 1},${y + .5}` : `M${x + .5},${y} L${x + .5},${y + 1}`;
            const color = colors.get(`${x},${y},${over}`);
            return <g key={`${x},${y}`} data-bridge={`${x},${y}`}>
                {!solution && <path d={horizontal ? `M${x + .5},${y + .12} V${y + .88}` : `M${x + .12},${y + .5} H${x + .88}`} stroke="#697773" strokeWidth=".12" />}
                <path d={d} stroke="#1C1F1E" strokeWidth=".48" />
                <path d={d} stroke="#e6e4df" strokeWidth={color ? '.36' : '.2'} />
                {color && <path d={d} stroke={color} strokeWidth=".26" />}
            </g>;
        })}
    </svg>;
}
