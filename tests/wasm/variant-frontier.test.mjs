import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bridgeCross, largeBridgeCover, warpRows, warpSnake } from '../fixtures/topology-puzzles.mjs';

const temporary = mkdtempSync(join(tmpdir(), 'flow-variant-frontier-test-'));
after(() => rmSync(temporary, { recursive: true, force: true }));
const build = spawnSync(process.env.EMCC || 'emcc', [fileURLToPath(new URL('./variant-frontier-probe.c', import.meta.url)),
  '-O3', '-std=c11', '-lm', '--no-entry', '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=node',
  '-sEXPORTED_FUNCTIONS=["_test_variant_frontier"]', '-sEXPORTED_RUNTIME_METHODS=["cwrap"]',
  '-sALLOW_MEMORY_GROWTH=1', '-sFILESYSTEM=0', '-o', join(temporary, 'probe.mjs')], {
  encoding: 'utf8', env: { ...process.env, EM_NODE_JS: process.env.EM_NODE_JS || process.execPath },
});
assert.equal(build.status, 0, build.stderr || build.error?.message);
const factory = (await import(pathToFileURL(join(temporary, 'probe.mjs')).href)).default;
const probe = (await factory()).cwrap('test_variant_frontier', 'string', ['string', 'number', 'number']);

// Independent graph construction: deduplicate wrap edges and split crossings.
function graphFor(f) {
  const area = f.width * f.height, graph = [];
  const blocks = new Set((f.topology.blocks ?? []).map(b => b.y * f.width + b.x));
  for (let id = 0; id < area; id++) graph.push({ position: id, endpoint: blocks.has(id) ? -2 : f.board[id % f.width][Math.floor(id / f.width)] - 1, mate: -1, neighbors: new Set() });
  const vertical = new Map();
  for (const b of f.topology.bridges) {
    const id = b.y * f.width + b.x, lane = graph.length;
    vertical.set(id, lane); graph[id].mate = lane;
    graph.push({ position: id, endpoint: -1, mate: id, neighbors: new Set() });
  }
  const add = (a, b, dy) => {
    if (blocks.has(a) || blocks.has(b)) return;
    if (dy) { a = vertical.get(a) ?? a; b = vertical.get(b) ?? b; }
    graph[a].neighbors.add(b); graph[b].neighbors.add(a);
  };
  for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) for (const [dx, dy, side] of [[1,0,'right'],[0,1,'down']]) {
    if (x + dx >= f.width || y + dy >= f.height || f.topology.walls.some(w => w.x === x && w.y === y && w.side === side)) continue;
    add(y * f.width + x, (y + dy) * f.width + x + dx, dy);
  }
  for (const seam of f.topology.warps) {
    if (seam.axis === 'horizontal') add(seam.index * f.width, seam.index * f.width + f.width - 1, 0);
    else add(seam.index, (f.height - 1) * f.width + seam.index, 1);
  }
  return graph;
}
function run(f, induced = false, transpose = false) {
  const graph = graphFor(f), text = `${graph.length} ${f.width}\n` + graph.map(v =>
    [v.endpoint, v.position, v.mate, ...[...v.neighbors], ...Array(4-v.neighbors.size).fill(-1)].join(' ')).join('\n');
  return { graph, result: JSON.parse(probe(text, Number(induced), Number(transpose))) };
}
function validate(graph, r, induced) {
  assert.equal(r.limited, false);
  if (!r.solved) return;
  const colors = [...new Set(graph.map(v => v.endpoint).filter(c => c >= 0))];
  for (let id = 0; id < graph.length; id++) {
    const v = graph[id], ns = r.selected[id].filter(n => n >= 0);
    if (v.endpoint === -2) { assert.equal(ns.length, 0); continue; }
    assert.equal(ns.length, v.endpoint >= 0 ? 1 : 2);
    assert.equal(new Set(ns).size, ns.length);
    if (v.endpoint >= 0) assert.equal(r.owner[id], v.endpoint);
    for (const n of ns) { assert.ok(v.neighbors.has(n)); assert.ok(r.selected[n].includes(id)); assert.equal(r.owner[n], r.owner[id]); }
    if (v.mate >= 0) assert.notEqual(r.owner[id], r.owner[v.mate]);
    if (induced) for (const n of v.neighbors) if (r.owner[n] === r.owner[id]) assert.ok(ns.includes(n));
  }
  for (const c of colors) {
    const members = r.owner.flatMap((v,id) => v === c ? [id] : []), seen = new Set([members[0]]), queue = [members[0]];
    for (const id of queue) for (const n of r.selected[id]) if (n >= 0 && !seen.has(n)) { seen.add(n); queue.push(n); }
    assert.equal(seen.size, members.length);
    assert.equal(members.filter(id => graph[id].endpoint === c).length, 2);
  }
}
// Unpruned explicit-path enumeration: no DSU, component or degree pruning.
function oracle(graph, induced) {
  const colors = [...new Set(graph.map(v => v.endpoint).filter(c => c >= 0))];
  const owner = graph.map(v => v.endpoint), pairs = colors.map(c => graph.flatMap((v,id) => v.endpoint === c ? [id] : []));
  const paths = [];
  function nextColor(at) {
    if (at === colors.length) return !owner.includes(-1) && (!induced || graph.every((v,id) => v.endpoint === -2 ||
      [...v.neighbors].filter(n => owner[n] === owner[id]).length === (v.endpoint >= 0 ? 1 : 2)));
    const c = colors[at], [start, goal] = pairs[at];
    const path = [start];
    function walk(id) {
      for (const n of graph[id].neighbors) {
        if (n === goal) { paths[at] = [...path, n]; if (nextColor(at+1)) return true; }
        else if (owner[n] === -1 && !(graph[n].mate >= 0 && owner[graph[n].mate] === c)) {
          owner[n] = c; path.push(n); if (walk(n)) return true; path.pop(); owner[n] = -1;
        }
      }
      return false;
    }
    return walk(start);
  }
  return nextColor(0);
}

test('compact variant probe alone agrees with 600 masked/walled/odd-wrapped tiny boards', () => {
  let state = 1729;
  const random = n => { state = (Math.imul(state,1664525)+1013904223)>>>0; return Math.floor(state / 2**32 * n); };
  for (let i = 0; i < 600; i++) {
    const cells = Array.from({length:9},(_,id)=>id);
    for(let j=8;j>0;j--) {const k=random(j+1);[cells[j],cells[k]]=[cells[k],cells[j]];}
    const board = Array.from({length:3},()=>Array(3).fill(0)), pairs=1+random(3);
    cells.slice(0,2*pairs).forEach((id,j)=>{board[id%3][Math.floor(id/3)]=1+(j>>1);});
    const topology = {walls:[],bridges:[],warps:[],blocks:[]};
    cells.slice(2*pairs).forEach(id=>{if(random(5)===0)topology.blocks.push({x:id%3,y:Math.floor(id/3)});});
    for(let y=0;y<3;y++)for(let x=0;x<3;x++)for(const side of ['right','down'])if((side==='right'?x:y)<2&&random(5)===0)topology.walls.push({x,y,side});
    for(const axis of ['horizontal','vertical'])for(let index=0;index<3;index++) {
      const ends=axis==='horizontal'?[index*3,index*3+2]:[index,index+6];
      if(random(2)&&!topology.blocks.some(b=>ends.includes(b.y*3+b.x)))topology.warps.push({axis,index});
    }
    const f={width:3,height:3,board,topology};
    for(const induced of [false,true])for(const transpose of [false,true]) {
      const {graph,result}=run(f,induced,transpose);
      assert.equal(result.solved,oracle(graph,induced),`Warp case ${i}, induced=${induced}, transpose=${transpose}`);
      validate(graph,result,induced);
    }
  }
});

test('compact variant probe checks bridge color exclusions and rollback against 300 exhaustive boards', () => {
  let state=7193;
  const random=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return Math.floor(state/2**32*n);};
  let solved=0, rejected=0;
  for(let i=0;i<300;i++) {
    const ids=[0,1,2,3,5,6,7,8];
    for(let j=7;j>0;j--){const k=random(j+1);[ids[j],ids[k]]=[ids[k],ids[j]];}
    if(i===0)ids.splice(0,8,0,8,2,6,1,3,5,7);
    const board=Array.from({length:3},()=>Array(3).fill(0));
    ids.slice(0,4).forEach((id,j)=>{board[id%3][Math.floor(id/3)]=1+(j>>1);});
    const topology={walls:[],blocks:[],warps:[],bridges:[{x:1,y:1,over:'horizontal'}]};
    if(i)for(let y=0;y<3;y++)for(let x=0;x<3;x++)for(const [dx,dy,side] of [[1,0,'right'],[0,1,'down']]) {
      if(x+dx>=3||y+dy>=3||(x===1&&y===1)||(x+dx===1&&y+dy===1))continue;
      if(random(5)===0)topology.walls.push({x,y,side});
    }
    for(const induced of [false,true])for(const transpose of [false,true]) {
      const {graph,result}=run({width:3,height:3,board,topology},induced,transpose);
      assert.equal(result.solved,oracle(graph,induced),`Bridge case ${i}, induced=${induced}, transpose=${transpose}`);
      validate(graph,result,induced); result.solved?solved++:rejected++;
    }
  }
  assert.ok(solved>0&&rejected>0);
});

test('compact variant probe covers deep 19x19 crossing and wrap graphs with heap frames', () => {
  for(const f of [bridgeCross(true),largeBridgeCover(19),warpRows(19,16),warpRows(19,16,true),warpSnake(19)]) {
    for(const induced of [false,true]) {
      const {graph,result}=run(f,induced);
      assert.ok(result.solved);validate(graph,result,induced);
    }
  }
});

test('self-touching variant covers are allowed only in the relaxed probe', () => {
  const f={width:2,height:2,board:[[1,0],[1,0]],topology:{walls:[],blocks:[],bridges:[],warps:[]}};
  const relaxed=run(f,false),induced=run(f,true);
  assert.ok(relaxed.result.solved);assert.equal(induced.result.solved,false);validate(relaxed.graph,relaxed.result,false);
});
