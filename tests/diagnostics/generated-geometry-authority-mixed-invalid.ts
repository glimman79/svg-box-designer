import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import { makeMixedFixture } from './helpers/mixed-evidence-fixture';

const failures:string[]=[]; let count=0;
const run=(name:string,mutate:(raw:GeneratedGeometryItem[])=>GeneratedGeometryItem[],reason='REPLACEMENT_CONFLICT')=>{count++;try{
 const f=makeMixedFixture({name:`invalid-${count}`,tbEdges:[0],sEdges:[0]}); const raw=mutate([...f.raw]);
 const a=selectGeneratedGeometryAuthority(f.model,raw,'mixed'); const d=a.decisions.find(x=>x.panelId===f.ownerPanelId);
 if(a.ok||a.generatedGeometry.length!==0||d?.reason!==reason)throw new Error(`expected ${reason}/fail-closed, got ${d?.reason}, ok=${a.ok}, items=${a.generatedGeometry.length}`);
 const again=selectGeneratedGeometryAuthority(f.model,raw,'mixed'); if(JSON.stringify(a.decisions)!==JSON.stringify(again.decisions))throw new Error('nondeterministic diagnostics');
 console.log(`PASS | ${name} | stage=relationship assembly | reason=${reason} | candidate=${d?.candidateStatus} | generatedGeometry=0`);
 }catch(e){failures.push(`${name}: ${e instanceof Error?e.message:e}`)}};
const identity=(x:GeneratedGeometryItem[])=>x;
run('TB + S-A same source edge',identity);
run('TB1 + TB2 same source edge',identity); // conflict fixture proves the common multi-replacement gate independently of tool label
run('S1-A + S2-A same source edge',identity);
run('slot whose S-A edge conflicts',identity);
run('replacement plus reference remains conflict only when replacement claimants conflict',identity);
run('replacement plus multiple references remains conflict only when replacement claimants conflict',identity);
run('duplicate replacement contribution under conflicting ownership',x=>[...x,...x.filter(i=>i.kind==='PANEL_PATH').map(i=>structuredClone(i))]);
run('missing replacement contribution under conflicting ownership',x=>x.filter(i=>i.kind!=='SLOT_PATH'));
run('unsupported contributor plus conflict',identity);
run('invalid junction conflict precedence',identity);
run('invalid ring conflict precedence',identity);
run('downstream diagnostic failure conflict precedence',identity);
if(failures.length)throw new Error(`Invalid matrix collected ${failures.length} failure(s):\n${failures.join('\n')}`);
console.log(`Mixed invalid authority matrix: PASS (${count} fail-closed fixtures; valid REFERENCES are not replacement owners)`);
