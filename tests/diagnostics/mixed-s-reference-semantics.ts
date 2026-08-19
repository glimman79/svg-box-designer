/** Mixed Authority B2: locked REFERENCES(source edge) product contract. */
import { auditGeneratedGeometryRelationships } from '../../src/app/geometryRelationships';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { pathDToClosedContour } from '../../src/app/geometryServices';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import type { Point, SvgDocumentModel } from '../../src/svgUtils';
import { makeEvidenceRectangle, makeMixedFixture } from './helpers/mixed-evidence-fixture';

const assert: (v: unknown, message: string) => asserts v = (v, message) => { if (!v) throw new Error(message); };
const same = (a: unknown, b: unknown, message: string) => assert(JSON.stringify(a) === JSON.stringify(b), message);
const distanceToLine = (p: Point, a: Point, b: Point) => Math.abs((b.x-a.x)*(a.y-p.y)-(a.x-p.x)*(b.y-a.y))/Math.hypot(b.x-a.x,b.y-a.y);
const projection = (p: Point, a: Point, b: Point) => ((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/((b.x-a.x)**2+(b.y-a.y)**2);
const centroid = (points: readonly Point[]) => ({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length});
const thicknessFor = (model: SvgDocumentModel) => ({defaultThicknessMm:3.2,panels:Object.fromEntries(model.panels.map((p,i)=>[p.id,{panelId:p.id,thicknessMm:[5.4,3.2,4.1][i%3]}]))});

type Replacement='none'|'TB'|'S';
type Topology='isolated'|'same-panel';
const buildCase = (name: string, replacement: Replacement, fingerWidth=9.5, topology:Topology='isolated') => {
  const f=makeMixedFixture({name,tbEdges:[0],sEdges:[1],manualTB:true,manualS:true});
  const slot=f.s.find(x=>x.kind==='SLOT_PATH'); assert(slot,`${name}: missing SLOT_PATH`);
  const ref=slot.sourceRelationships?.find(x=>x.kind==='references'); assert(ref,`${name}: missing REFERENCES`);
  const target=f.model.edges.find(x=>x.source===ref.panelId&&x.id===ref.sourceEdgeId); assert(target,`${name}: imported source edge absent`);
  let added:GeneratedGeometryItem[]=[];
  if(replacement!=='none'){
    const targetPanel=f.model.panels.find(p=>p.id===ref.panelId)!;
    // Never borrow a generated mate as a spare. Separately appended same-tool
    // batches can otherwise leave duplicate, incomplete whole-panel legacy
    // carriers; that packaging question is deliberately outside B2B.
    const spare=makeEvidenceRectangle(`${name}-${replacement}-fresh-spare`,800,420,120,80);
    f.model={...f.model,panels:[...f.model.panels,spare.panel],edges:[...f.model.edges,...spare.edges]};
    const sparePanel=spare.panel;
    const targetIndex=targetPanel.edgeIds.indexOf(ref.sourceEdgeId); const spareEdge=sparePanel.edgeIds[(targetIndex+1)%4];
    const id=`${name}-${replacement}-replacement`;
    if(replacement==='TB') {
      const assignments:any={[ref.sourceEdgeId]:{edgeAssignment:{connectionId:id,edgeRole:'A'}},[spareEdge]:{edgeAssignment:{connectionId:id,edgeRole:'B'}}};
      const connections:any={[id]:{id,prefix:'TB',properties:{fingerWidthMm:fingerWidth,isFingerWidthManual:true}}};
      if(topology==='same-panel'){
        // "Same-panel" means the S-B reference target also participates in
        // the original TB operation on a different edge. Generate the two TB
        // operations coherently, so this tests topology rather than carriers.
        const original=`${name}-TB-0`, owner=f.model.panels.find(p=>p.id===f.ownerPanelId)!;
        assignments[owner.edgeIds[3]]={edgeAssignment:{connectionId:original,edgeRole:'A'}};
        assignments[targetPanel.edgeIds[1]]={edgeAssignment:{connectionId:original,edgeRole:'B'}};
        connections[original]={id:original,prefix:'TB',properties:{fingerWidthMm:11.3,isFingerWidthManual:true}};
      }
      added=buildGeneratedTBGeometryItems(f.model,assignments,connections,thicknessFor(f.model));
      if(topology==='same-panel') f.raw=f.raw.filter(x=>!f.tb.includes(x));
    } else {
      const assignments:any={}; const connections:any={};
      if(topology==='same-panel'){
        const original=`${name}-S-0`, owner=f.model.panels.find(p=>p.id===f.ownerPanelId)!;
        assignments[owner.edgeIds[1]]={slotAssignments:[{connectionId:original,slotRole:'A'}]};
        assignments[ref.sourceEdgeId]={slotAssignments:[{connectionId:original,slotRole:'B'},{connectionId:id,slotRole:'A'}]};
        connections[original]={id:original,prefix:'S',properties:{slotLengthMm:14.2,isSlotLengthManual:true,slotOffsetMm:0}};
      } else assignments[ref.sourceEdgeId]={slotAssignments:[{connectionId:id,slotRole:'A'}]};
      assignments[spareEdge]={slotAssignments:[{connectionId:id,slotRole:'B'}]};
      connections[id]={id,prefix:'S',properties:{slotLengthMm:10.7,isSlotLengthManual:true,slotOffsetMm:.8}};
      added=buildGeneratedSGeometryItems(f.model,assignments,connections,thicknessFor(f.model));
      if(topology==='same-panel') f.raw=f.raw.filter(x=>!f.s.includes(x));
    }
  }
  const raw=[...f.raw,...added]; const selected=selectGeneratedGeometryAuthority(f.model,raw,'mixed');
  assert(selected.ok,`${name}: reference plus valid replacement was rejected: ${selected.blockingDecisions.map(x=>x.reason)}`);
  const index=auditGeneratedGeometryRelationships(raw); const source=index.sources.find(x=>x.source.panelId===ref.panelId&&x.source.sourceEdgeId===ref.sourceEdgeId);
  assert(source&&source.references.includes(ref.operationId),`${name}: reference not indexed`);
  if(replacement==='none') assert(source.replacementOwner===null,`${name}: unexpected replacement owner`);
  else assert(source.replacementOwner===idFor(added,ref.sourceEdgeId),`${name}: replacement owner lost`);
  const selectedSlot=selected.generatedGeometry.find(x=>x.id===slot.id); assert(selectedSlot,`${name}: referenced slot not packaged`);
  same(selectedSlot.pathD,slot.pathD,`${name}: composition moved the generated slot`);
  const points=pathDToClosedContour(selectedSlot.pathD); assert(points&&points.length>=4,`${name}: slot contour unreadable`);
  const c=centroid(points); const along=projection(c,target.start,target.end); const distances=points.map(p=>distanceToLine(p,target.start,target.end));
  assert(along>=-1e-9&&along<=1+1e-9,`${name}: slot lies outside imported source-edge span`);
  assert(Math.min(...distances)>1e-6&&Math.max(...distances)-Math.min(...distances)<1e-7,`${name}: slot is not at a stable normal offset from imported source edge`);
  const replacementProfile=added.flatMap(x=>x.generatedProfiles??[]).find(p=>p.panelId===ref.panelId&&p.sourceEdgeId===ref.sourceEdgeId);
  if(replacementProfile){
    same(replacementProfile.sourceEdgeDirection,{start:target.start,end:target.end},`${name}: replacement does not identify same imported edge`);
    assert(replacementProfile.geometryProjections.some(p=>distanceToLine(p.start,target.start,target.end)>1e-6||distanceToLine(p.end,target.start,target.end)>1e-6),`${name}: replacement contour did not differ from source datum`);
  }
  const created=index.features.filter(x=>x.feature.panelId===ref.panelId&&x.feature.kind==='SLOT_PATH');
  assert(created.length>0,`${name}: SLOT_PATH creation ownership absent`);
  assert(source.replacementClaimants.length===(replacement==='none'?0:1),`${name}: unexpected replacement claimants`);
  assert(!index.diagnostics.some(x=>x.kind==='replacement-conflict'),`${name}: valid case has replacement conflict`);
  same(auditGeneratedGeometryRelationships([...raw].reverse()),index,`${name}: relationship input order changed normalized index`);
  console.log(`TOPOLOGY ${name} | target=${ref.panelId}/${ref.sourceEdgeId} | replacement=${source.replacementOwner??'none'} | references=${source.references.join(',')} | created=${created.map(x=>`${x.creator}:${x.feature.featureId}`).join(',')} | spare=${replacement==='none'?'none':`${name}-${replacement}-fresh-spare`} | same-panel=${topology==='same-panel'}`);
  return {f,slot,ref,target,selectedSlot,source,added,along,distances,index};
};
const idFor=(items:readonly GeneratedGeometryItem[],edgeId:string)=>items.flatMap(x=>x.generatedProfiles??[]).find(p=>p.sourceEdgeId===edgeId)?.operationId;

const A=buildCase('case-A','none');
const B=buildCase('case-B','TB');
const C=buildCase('case-C','S');
// D/E exercise the identical same-panel ownership rule: REFERENCES remains non-owning even where the target panel is composed.
const D=buildCase('case-D','TB',13.25,'same-panel');
const E=buildCase('case-E','S',9.5,'same-panel');
for(const [id,value] of Object.entries({A,B,C,D,E})) console.log(`CASE ${id} | VALID | source projection=${value.along.toFixed(6)} | owner=${value.source?.replacementOwner??'none'} | REFERENCES=stable-imported-source`);

// Metamorphic replacement test: only TB replacement parameters change. S source edge and S output are bit-identical.
const Bvariant=buildCase('case-B', 'TB', 18.75);
same(Bvariant.selectedSlot.pathD,B.selectedSlot.pathD,'Case B: finger-width variation moved S-B slot');
same(Bvariant.along,B.along,'Case B: finger-width variation changed source-relative placement');
assert(JSON.stringify(Bvariant.added)!==JSON.stringify(B.added),'Case B: replacement variant did not actually change');
console.log('REPLACEMENT INDEPENDENCE | PASS | TB contour changed; S-B source-relative SLOT_PATH did not');

const conflict=makeMixedFixture({name:'case-F',tbEdges:[0],sEdges:[0]});
const conflictIndex=auditGeneratedGeometryRelationships(conflict.raw);
const conflictSource=conflictIndex.sources.find(x=>x.source.panelId===conflict.ownerPanelId&&x.source.sourceEdgeId===conflict.model.panels.find(p=>p.id===conflict.ownerPanelId)!.edgeIds[0]);
assert(conflictSource?.replacementOwner===null,'Case F: conflicted source unexpectedly selected an owner');
assert(conflictSource.replacementClaimants.length===2&&new Set(conflictSource.replacementClaimants).size===2,'Case F: expected two distinct replacement claimants');
const conflictDiagnostic=conflictIndex.diagnostics.find(x=>x.kind==='replacement-conflict');
assert(conflictDiagnostic&&sameSet(conflictDiagnostic.operationIds,conflictSource.replacementClaimants),'Case F: normalized replacement-conflict diagnostic absent');
const rejected=selectGeneratedGeometryAuthority(conflict.model,conflict.raw,'mixed');
assert(!rejected.ok&&rejected.generatedGeometry.length===0&&rejected.blockingDecisions.some(x=>x.reason==='REPLACEMENT_CONFLICT'),'Case F: invalid replacement ownership did not fail closed');
console.log(`CASE F | INVALID | source=${conflictSource.source.panelId}/${conflictSource.source.sourceEdgeId} | claimants=${conflictSource.replacementClaimants.join(',')} | owner=none | diagnostic=${conflictDiagnostic.kind} | generatedGeometry=0`);
console.log('S-B REFERENCES contract | PRODUCT SEMANTIC RESOLVED | original stable source-edge geometry');

function sameSet(a:readonly string[],b:readonly string[]){return a.length===b.length&&a.every(x=>b.includes(x));}
