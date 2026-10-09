import type { Board } from './astar-solver';
import { nodeKey, topologyGraph, type PuzzleTopology } from './topology';
import { validateSolution, type PuzzleSolution } from './solution';
import { createZ3Context } from './z3-solver';
import { SearchLimitError } from './solver-errors';

/** Choose explicit graph edges: crossing lanes stay separate and seams are
 * ordinary graph edges. Directed paths with increasing ranks join endpoint
 * pairs without detached cycles. A limit is never reported as unsatisfiable.
 */
export async function solveZ3Topology(board: Board, topology: PuzzleTopology, induced = false, candidate?: PuzzleSolution): Promise<PuzzleSolution | null> {
    const started = performance.now(), budgetMs = 30_000;
    const { Solver, BitVec, Bool, PbEq, Or, And, Implies, isTrue } = await createZ3Context();
    const solver = new Solver('QF_BV');
    const exactly = (terms: ReturnType<typeof Bool.const>[], count: number) => {
        if (!terms.length) return Bool.val(count === 0);
        const [first, ...rest] = terms;
        return PbEq([first, ...rest], [1, ...rest.map(() => 1)], count);
    };
    const { nodes, edges } = topologyGraph(board.length, board[0].length, topology);
    const colors = [...new Set(board.flat().filter(Boolean))];
    const values = nodes.map((_, id) => BitVec.const(`color_${id}`, 5));
    const endpoints = nodes.map(node => node.lane === 'cell' ? board[node.x][node.y] : 0);
    const pairs = new Map<number, number[]>();
    const links = edges.flatMap((neighbors, a) => neighbors.filter(b => b > a).map(b => ({ a, b,
        chosen: Bool.const(`edge_${a}_${b}`), forward: Bool.const(`direction_${a}_${b}`) })));
    const incident = nodes.map(() => [] as number[]);
    links.forEach(({ a, b, chosen }, id) => {
        incident[a].push(id); incident[b].push(id);
        const sameColor = values[a].eq(values[b]);
        solver.add(induced ? chosen.eq(sameColor) : Implies(chosen, sameColor));
    });
    nodes.forEach((_, id) => {
        const color = endpoints[id];
        if (color) {
            solver.add(values[id].eq(BitVec.val(color, 5)));
            pairs.set(color, [...(pairs.get(color) ?? []), id]);
        } else solver.add(Or(...colors.map(color => values[id].eq(BitVec.val(color, 5)))));
        const terms = incident[id].map(edge => links[edge].chosen);
        solver.add(exactly(terms, color ? 1 : 2));
    });
    topology.bridges.forEach(({ x, y }, index) => {
        solver.add(values[y * board.length + x].neq(values[board.length * board[0].length + index]));
    });

    // Orient every path from its first endpoint. One incoming edge at each
    // other node and strictly increasing ranks forbid detached cycles in the
    // original model, instead of repeatedly searching and excluding loops.
    const rankBits = Math.ceil(Math.log2(nodes.length));
    const ranks = nodes.map((_, id) => BitVec.const(`rank_${id}`, rankBits));
    nodes.forEach((_, id) => {
        const source = endpoints[id] !== 0 && pairs.get(endpoints[id])![0] === id;
        if (source) solver.add(ranks[id].eq(BitVec.val(0, rankBits)));
        const incoming = incident[id].map(edge => {
            const link = links[edge];
            return And(link.chosen, link.a === id ? link.forward.not() : link.forward);
        });
        solver.add(exactly(incoming, source ? 0 : 1));
    });
    links.forEach(({ a, b, chosen, forward }) => {
        solver.add(Implies(And(chosen, forward), ranks[a].ult(ranks[b])));
        solver.add(Implies(And(chosen, forward.not()), ranks[b].ult(ranks[a])));
    });

    // Generated boards retain a complete cover. Check it against all SAT
    // constraints rather than spending the search budget rediscovering it.
    // This optional certificate is validated independently before use.
    if (candidate) {
        validateSolution(board, topology, candidate);
        const ids = new Map(nodes.map((node, id) => [nodeKey(node), id]));
        const steps = new Set<string>();
        for (const path of candidate.paths) {
            let route = path.nodes.map(node => ids.get(nodeKey(node))!);
            if (route[0] !== pairs.get(path.color)![0]) route = [...route].reverse();
            route.forEach((id, index) => {
                solver.add(values[id].eq(BitVec.val(path.color, 5)), ranks[id].eq(BitVec.val(index, rankBits)));
                if (index) steps.add(`${route[index - 1]},${id}`);
            });
        }
        links.forEach(({ a, b, chosen, forward }) => {
            const direction = steps.has(`${a},${b}`);
            solver.add(chosen.eq(Bool.val(direction || steps.has(`${b},${a}`))));
            if (direction || steps.has(`${b},${a}`)) solver.add(forward.eq(Bool.val(direction)));
        });
    }

    const remaining = budgetMs - (performance.now() - started);
    if (remaining <= 0) throw new SearchLimitError();
    solver.set('timeout', Math.max(1, Math.floor(remaining)));
    const check = await solver.check();
    if (check === 'unsat') return null;
    if (check !== 'sat') throw new SearchLimitError();
    const model = solver.model();
    const chosen = links.map(link => isTrue(model.eval(link.chosen)));
    const neighbors = nodes.map((_, id) => incident[id].filter(edge => chosen[edge]).map(edge => {
        const link = links[edge]; return link.a === id ? link.b : link.a;
    }));
    const solution: PuzzleSolution = { version: 1, paths: [] };
    for (const [color, pair] of pairs) {
        const path = [pair[0]];
        let previous = -1, current = pair[0];
        while (current !== pair[1]) {
            const next = neighbors[current].find(next => next !== previous);
            if (next === undefined || path.length >= nodes.length) throw new Error('Invalid SAT path');
            previous = current; current = next; path.push(current);
        }
        solution.paths.push({ color, nodes: path.map(id => nodes[id]) });
    }
    validateSolution(board, topology, solution);
    return solution;
}
