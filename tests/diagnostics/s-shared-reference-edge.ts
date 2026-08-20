import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { auditGeneratedGeometryRelationships } from '../../src/app/geometryRelationships';
import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { processManufacturingGeometry } from '../../src/app/manufacturingCompensation';
import { createGeneratedGeometrySnapshot, restoreGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { makeEvidenceRectangle } from './helpers/mixed-evidence-fixture';
import type { SvgDocumentModel } from '../../src/svgUtils';

const assert:(v:unknown,m:string)=>asserts v=(v,m)=>{if(!v)throw new Error(m);};
const receiver=makeEvidenceRectangle('shared-receiver',20,20,160,90);
const walls=[0,1,2].map(i=>makeEvidenceRectangle(`shared-wall-${i+1}`,300+i*220,20,160,90));
const model:SvgDocumentModel={content:'',innerMarkup:'',rootAttributes:{width:null,height:null,viewBox:null},viewBox:'0 0 1200 400',width:1200,height:400,
  panels:[receiver.panel,...walls.map(x=>x.panel)],edges:[...receiver.edges,...walls.flatMap(x=>x.edges)]};
const ids=['S1','S2','S3'];
const connections=Object.fromEntries(ids.map((id,i)=>[id,{id,prefix:'S' as const,properties:{slotLengthMm:14,isSlotLengthManual:true,slotOffsetMm:[20,40,60][i]}}]));
const assignmentEntries=ids.flatMap((id,i)=>[
  [walls[i].panel.edgeIds[0],{slotAssignments:[{connectionId:id,slotRole:'A'}]}],
  [receiver.panel.edgeIds[2],{slotAssignments:[{connectionId:id,slotRole:'B'}]}],
] as const);
// Merge the three legal B roles rather than overwriting their shared edge carrier.
const assignments:any={};
assignmentEntries.forEach(([edgeId,value])=>{assignments[edgeId]??={slotAssignments:[]};assignments[edgeId].slotAssignments.push(...value.slotAssignments);});
const thickness={defaultThicknessMm:3,panels:Object.fromEntries(model.panels.map(p=>[p.id,{panelId:p.id,thicknessMm:3}]))};
const run=(reverseConnections=false,reverseAssignments=false)=>{
  const orderedConnections:any=Object.fromEntries((reverseConnections?[...ids].reverse():ids).map(id=>[id,connections[id]]));
  const orderedAssignments:any=Object.fromEntries((reverseAssignments?Object.entries(assignments).reverse():Object.entries(assignments)));
  const raw=buildGeneratedSGeometryItems(model,orderedAssignments,orderedConnections,thickness);
  const relationship=auditGeneratedGeometryRelationships(raw);
  const shared=relationship.sources.find(x=>x.source.panelId===receiver.panel.id&&x.source.sourceEdgeId===receiver.panel.edgeIds[2]);
  assert(shared?.references.length===3&&shared.replacementOwner===null,'shared B edge ownership/reference invariant failed');
  assert(walls.every(w=>relationship.sources.find(x=>x.source.panelId===w.panel.id&&x.source.sourceEdgeId===w.panel.edgeIds[0])?.replacementOwner),'S-A owner absent');
  const slots=raw.filter(x=>x.kind==='SLOT_PATH'); assert(ids.every(id=>slots.some(x=>x.operationId===`operation:S:${id}`))&&new Set(slots.map(x=>x.id)).size===slots.length,'independent slots absent');
  const selected=selectGeneratedGeometryAuthority(model,raw,'mixed'); assert(selected.ok,'shared-S authority failed');
  const final=buildFinalGeometry(model,selected.generatedGeometry); assert(!final.diagnostics.some(x=>x.severity==='error'),'shared-S FinalGeometry failed');
  const manufacturing=processManufacturingGeometry(final,.12,.08,0,[],.06); assert(!manufacturing.diagnostics.some(x=>x.severity==='error'),'shared-S manufacturing failed');
  const snapshot=createGeneratedGeometrySnapshot({generatedGeometry:[...selected.generatedGeometry],panelCompositionModel:selected.panelCompositionModel});
  const restored=restoreGeneratedGeometrySnapshot(structuredClone(snapshot)); assert(JSON.stringify(restored.generatedGeometry)===JSON.stringify(selected.generatedGeometry),'shared-S restore failed');
  return {raw,slots,final,manufacturing};
};
const baseline=run();
for(const variant of [run(true,false),run(false,true),run(true,true)]){
  const physical=(x:typeof baseline)=>JSON.stringify(x.slots.map(s=>({id:s.id,pathD:s.pathD})).sort((a,b)=>a.id.localeCompare(b.id)));
  assert(physical(variant)===physical(baseline),'S ordering changed physical slots');
}
console.log(`PASS | 3 complete S connections | shared references=3 | SLOT_PATH=${baseline.slots.length} | FinalGeometry/manufacturing/restore/order independent`);
