import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { wallCorridor, wallText } from '../fixtures/wall-puzzles.mjs';
import { smallCovers, smallLayouts } from '../fixtures/classic-oracle.mjs';
import { blockRows } from '../fixtures/block-puzzles.mjs';

// Compile a private adapter to test the real probe without graph/path/SAT
// fallback. Otherwise an over-aggressive corner rule could hide behind fallback.
const temporary = mkdtempSync(join(tmpdir(), 'flow-frontier-test-'));
after(() => rmSync(temporary, { recursive: true, force: true }));
const source = fileURLToPath(new URL('./frontier-probe.c', import.meta.url));
const build = spawnSync(process.env.EMCC || 'emcc', [source, '-O3', '-std=c11', '-lm', '--no-entry',
  '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=node',
  '-sEXPORTED_FUNCTIONS=["_test_frontier"]', '-sEXPORTED_RUNTIME_METHODS=["cwrap"]',
  '-sALLOW_MEMORY_GROWTH=1', '-sFILESYSTEM=0', '-o', join(temporary, 'probe.mjs')], {
  encoding: 'utf8', env: { ...process.env, EM_NODE_JS: process.env.EM_NODE_JS || process.execPath },
});
assert.equal(build.status, 0, build.stderr || build.error?.message);
const factory = (await import(pathToFileURL(join(temporary, 'probe.mjs')).href)).default;
const probe = (await factory()).cwrap('test_frontier', 'string', ['string', 'string']);

function oracle(input, walls) {
  const rows = input.split('\n'), width = rows[0].length, area = rows.length * width;
  const cells = rows.join(''), blocked = new Set(walls.map(w =>
    [w.y * width + w.x, w.side === 'right' ? w.y * width + w.x + 1 : (w.y + 1) * width + w.x].sort((a,b)=>a-b).join(':')));
  const neighbors = Array.from({ length: area }, (_, id) => {
    const x = id % width, y = Math.floor(id / width);
    return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([x,y])=>x>=0&&y>=0&&x<width&&y<rows.length)
      .map(([x,y])=>y*width+x).filter(n=>cells[n]!=='#'&&!blocked.has([id,n].sort((a,b)=>a-b).join(':')));
  });
  const colors = [...new Set(cells.replace(/[.#]/g,''))];
  const pairs = colors.map(c=>[...cells].flatMap((v,id)=>v===c?[id]:[]));
  const owner = [...cells].map(c=>c==='#'?-2:c==='.'?-1:colors.indexOf(c));
  function connect(color) {
    if (color===pairs.length) return !owner.includes(-1) && neighbors.every((ns,id)=>cells[id]==='#'||
      ns.filter(n=>owner[id]===owner[n]).length===(cells[id]==='.'?2:1));
    const [start,goal] = pairs[color];
    function walk(id) {
      for(const n of neighbors[id]) {
        if(n===goal) {if(connect(color+1))return true;}
        else if(owner[n]===-1) {owner[n]=color;if(walk(n))return true;owner[n]=-1;}
      }
      return false;
    }
    return walk(start);
  }
  return connect(0);
}

test('frontier pruning alone agrees with independent masked/walled 3x3 path enumeration', () => {
  let state = 271828;
  const random = n => {state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
  for(let caseId=0;caseId<600;caseId++) {
    const ids=Array.from({length:9},(_,i)=>i);
    for(let j=8;j>0;j--) {const k=random(j+1);[ids[j],ids[k]]=[ids[k],ids[j]];}
    const count=1+random(3), cells=Array(9).fill('.');
    ids.slice(0,count*2).forEach((id,i)=>cells[id]='RBY'[i>>1]);
    ids.slice(count*2).forEach(id=>{if(random(4)===0)cells[id]='#';});
    const walls=[];
    for(let y=0;y<3;y++)for(let x=0;x<3;x++)for(const side of ['right','down']){
      if((side==='right'?x:y)<2&&random(4)===0)walls.push({x,y,side});
    }
    const input=[0,3,6].map(i=>cells.slice(i,i+3).join('')).join('\n');
    const expected=oracle(input,walls), result=JSON.parse(probe(input,wallText(walls)));
    assert.equal(result!==null,expected,`Direct frontier disagreement ${caseId}: ${input}, ${JSON.stringify(walls)}`);
    if(result)assertSolution(input,result,walls);
  }
});

test('a wall breaks corner propagation and permits the long 2x2 path', () => {
  const input='RR\n..', walls=[{x:0,y:0,side:'right'}];
  assert.equal(probe(input,''),'null');
  assertSolution(input,JSON.parse(probe(input,wallText(walls))),walls);
});

test('holes break corner spikes without requiring a diagonal terminal', () => {
  const input='R..\n##.\nBBR';
  assertSolution(input,JSON.parse(probe(input,'')));
});

test('direct frontier covers 19x19 blocks and walled corridors with heap frames', () => {
  const blocked=blockRows(19,19);assertSolution(blocked.input,JSON.parse(probe(blocked.input,'')));
  const f=wallCorridor(19,19);assertSolution(f.input,JSON.parse(probe(f.input,wallText(f.walls))),f.walls);
});


test('open frontier alone agrees with every 1–3 pair 3x3 endpoint layout', () => {
  const covers=smallCovers(), layouts=smallLayouts();
  assert.equal(layouts.size,1674);
  for(const input of layouts) {
    const result=JSON.parse(probe(input,''));
    assert.equal(result!==null,covers.has(input),input);
    if(result)assertSolution(input,result);
  }
});

test('direct decimal output round-trips all 16 colors and zero-valued blocks', () => {
  const input=[...'RBYGOCMmPAWgTbcp'].map(c=>c+'.'.repeat(16)+c+'#').join('\n');
  assertSolution(input,JSON.parse(probe(input,'')));
});
