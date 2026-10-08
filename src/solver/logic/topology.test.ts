import { normalizeTopology, topologyGraph } from './topology';
import { validateSolution } from './solution';
import { parseTopologySolution, serializeTopology } from './heuristic-solver';
import { bridgeCross, warpRows } from '../../../tests/fixtures/topology-puzzles.mjs';
import { assertTopologySolution } from '../../../tests/fixtures/assert-topology-solution.mjs';

for (const fixture of [warpRows(), warpRows(8, 5, true), bridgeCross(), bridgeCross(true, 'vertical')]) {
    test(`${fixture.mode} ${fixture.width}x${fixture.height}: validates full cover and native IDs`, () => {
        const topology = normalizeTopology(fixture.topology, fixture.board, fixture.mode);
        validateSolution(fixture.board, topology, fixture.solution);
        assertTopologySolution(fixture, fixture.solution);
        const graph = topologyGraph(fixture.width, fixture.height, topology);
        expect(graph.nodes.length).toBe(fixture.width * fixture.height + topology.bridges.length);
        graph.edges.forEach((edges, id) => edges.forEach(n => expect(graph.edges[n]).toContain(id)));
        expect(serializeTopology(topology, fixture.mode)).toContain('V1\nMODE,');
    });
}

test('rejects incompatible modes, malformed seams and bridge conflicts', () => {
    const b = bridgeCross();
    expect(() => normalizeTopology(b.topology, b.board, 'standard')).toThrow('Bridges require');
    expect(() => normalizeTopology({ warps: [{ axis: 'horizontal', index: 5 }] }, b.board, 'warps')).toThrow('Invalid warp');
    expect(() => normalizeTopology({ bridges: [{ x: 0, y: 1, over: 'horizontal' }] }, b.board, 'bridges')).toThrow('interior');
    expect(() => normalizeTopology({ bridges: [{ x: 1, y: 0, over: 'horizontal' }] }, b.board, 'bridges')).toThrow();
    expect(() => normalizeTopology({ ...b.topology, walls: [{ x: 2, y: 2, side: 'right' }] }, b.board, 'bridges')).toThrow('four sides');
    expect(() => normalizeTopology({ bridges: [b.topology.bridges[0], { ...b.topology.bridges[0], over: 'vertical' }] }, b.board, 'bridges')).toThrow('Conflicting');
    expect(() => normalizeTopology({ walls: [] }, [[0], [0]], 'standard')).toThrow('board');
});

test('independent validator rejects missing coverage, closed seams and bridge lane transfer', () => {
    const warp = warpRows();
    const missing = structuredClone(warp.solution); missing.paths.pop();
    expect(() => assertTopologySolution(warp, missing)).toThrow();
    expect(() => validateSolution(warp.board, warp.topology, missing)).toThrow();
    const closed = { ...warp, topology: { ...warp.topology, warps: [] } };
    expect(() => assertTopologySolution(closed, warp.solution)).toThrow('Closed seam');
    expect(() => validateSolution(closed.board, closed.topology, warp.solution)).toThrow('Illegal path step');
    const b = bridgeCross(), bad = structuredClone(b.solution);
    bad.paths[0].nodes[2].lane = 'horizontal';
    expect(() => assertTopologySolution(b, bad)).toThrow('lane');
    expect(() => validateSolution(b.board, b.topology, bad)).toThrow();
});

test('C response parsing distinguishes limit and unsatisfiable and rejects invalid paths', () => {
    const f = warpRows();
    expect(parseTopologySolution('{"version":1,"status":"limit"}', f.board, f.topology).status).toBe('limit');
    expect(parseTopologySolution('{"version":1,"status":"unsatisfiable"}', f.board, f.topology).solution).toBeNull();
    expect(() => parseTopologySolution('{"version":1,"status":"solved","paths":[]}', f.board, f.topology)).toThrow('coverage');
    expect(() => parseTopologySolution('{"version":2,"status":"solved"}', f.board, f.topology)).toThrow();
});
