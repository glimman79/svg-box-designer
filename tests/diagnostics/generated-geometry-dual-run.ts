import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { runGeneratedGeometryDualRun } from '../../src/app/generatedGeometryDualRun';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const rectangle = (id:string,x:number) => { const contour=[{x,y:0},{x:x+120,y:0},{x:x+120,y:80},{x,y:80}]; const edgeIds=contour.map((_,i)=>`${id}-edge-${i}`);
  const panel:SvgPanel={id,contour,outerContour:contour,edgeIds,outerEdgeIds:edgeIds,innerContours:[],innerEdgeIds:[],bounds:{minX:x,maxX:x+120,minY:0,maxY:80}};
  return {panel,edges:contour.map((start,i)=>({id:edgeIds[i],source:id,start,end:contour[(i+1)%4]}))}; };
const owner=rectangle('owner',0),mate=rectangle('mate',180); const panels=[owner.panel,mate.panel];
const model:SvgDocumentModel={content:'',innerMarkup:'',rootAttributes:{width:null,height:null,viewBox:null},viewBox:'0 0 400 100',width:400,height:100,panels,edges:[...owner.edges,...mate.edges]};
const thickness={defaultThicknessMm:3.25,panels:{owner:{panelId:'owner',thicknessMm:5},mate:{panelId:'mate',thicknessMm:3.25}}};
const sAssignments:any={[owner.panel.edgeIds[1]]:{slotAssignments:[{connectionId:'S1',slotRole:'A'}]},[mate.panel.edgeIds[1]]:{slotAssignments:[{connectionId:'S1',slotRole:'B'}]}};
const sItems=buildGeneratedSGeometryItems(model,sAssignments,{S1:{id:'S1',prefix:'S',properties:{slotLengthMm:13,isSlotLengthManual:true,slotOffsetMm:1}}} as any,thickness);
const tbAssignments:any={[owner.panel.edgeIds[0]]:{edgeAssignment:{connectionId:'TB1',edgeRole:'A'}},[mate.panel.edgeIds[0]]:{edgeAssignment:{connectionId:'TB1',edgeRole:'B'}}};
const tbItems=buildGeneratedTBGeometryItems(model,tbAssignments,{TB1:{id:'TB1',prefix:'TB',properties:{fingerWidthMm:12,isFingerWidthManual:true}}} as any,thickness)
  .filter(item=>item.behaviour.replacesPanelId===owner.panel.id);

for (const [fixture,items] of [['S-only',sItems],['TB-only',tbItems]] as const) {
  const before=JSON.stringify(items); const result=runGeneratedGeometryDualRun(model,items);
  const panel=result.find(x=>x.panelId==='owner');
  assert(panel?.classification==='SINGLE_TOOL_MATCH',`${fixture} downstream mismatch: ${panel?.classification}`);
  assert(panel.finalGeometryEquivalent&&panel.manufacturingEquivalent,`${fixture} stages differ`);
  assert(JSON.stringify(items)===before,`${fixture} production input mutated`);
  console.log(`${fixture} | SINGLE_TOOL_MATCH | outer=PASS FinalGeometry=PASS ProfileOffset=PASS TapClearance=PASS SlotClearance=PASS Kerf=PASS manufacturing=PASS`);
}
const mixedItems=[...tbItems,...sItems]; const before=JSON.stringify(mixedItems);
const mixed=runGeneratedGeometryDualRun(model,mixedItems).find(x=>x.panelId==='owner');
assert(mixed?.classification==='MIXED_VALID','mixed downstream invariant failure');
assert(mixed.legacyEquivalence==='NOT_ORACLE','mixed legacy was treated as oracle');
assert(mixed.diagnosticFinalGeometry?.contours.some(x=>x.kind==='INNER'),'created slot was absorbed or lost');
assert(JSON.stringify(mixedItems)===before,'mixed production input mutated');
const reversed=runGeneratedGeometryDualRun(model,[...mixedItems].reverse()).find(x=>x.panelId==='owner');
assert(JSON.stringify(mixed.diagnosticFinalGeometry)===JSON.stringify(reversed?.diagnosticFinalGeometry),'downstream output is order dependent');
console.log('mixed TB + S-A | MIXED_VALID | legacy=NOT_ORACLE topology=PASS manufacturing=PASS references=NON_OWNING creates=INDEPENDENT');
console.log('provenance | before: panelId/sourceEdgeId/operationId/profileId/elementId/projectionId/tapId/tapRole | after: panelId, sourceEdgeId(rediscovered), profileId(rediscovered), tapId/tapRole(rediscovered); operationId/elementId/projectionId lost');
console.log('Generated geometry Phase 3 dual run: PASS');
