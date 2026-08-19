import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { createGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { buildFinalGeometry } from '../../src/app/finalGeometry';
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


const mixedItems=[...tbItems,...sItems];
const baseline=selectGeneratedGeometryAuthority(model,mixedItems,'legacy');
const single=selectGeneratedGeometryAuthority(model,mixedItems,'single-tool');
const enabled=selectGeneratedGeometryAuthority(model,mixedItems,'mixed');
const decision=enabled.decisions.find(value=>value.panelId==='owner');
assert(single.decisions.find(value=>value.panelId==='owner')?.reason==='MIXED_NOT_ENABLED','single-tool mode admitted mixed ownership');
assert(decision?.authority==='COMPOSED'&&decision.cohort==='MIXED'&&decision.reason==='MIXED_APPROVED','mixed panel was not approved');
assert(decision.downstreamEquivalenceGate==='APPROVED','mixed downstream gate did not pass');
assert(enabled.panelCompositionModel==='relationship-composed-mixed-v1','mixed snapshot marker missing');
assert(enabled.generatedGeometry.filter(item=>item.kind==='PANEL_PATH'&&item.behaviour.replacesPanelId==='owner').length===1,'mixed boundary is not unique');
assert(sItems.filter(item=>item.kind==='SLOT_PATH').every(slot=>enabled.generatedGeometry.some(item=>item.id===slot.id&&item.pathD===slot.pathD&&item.operationId===slot.operationId)),'created slots changed');
const reversed=selectGeneratedGeometryAuthority(model,[...mixedItems].reverse(),'mixed');
assert(JSON.stringify(enabled.generatedGeometry)===JSON.stringify(reversed.generatedGeometry),'mixed authority depends on item order');
assert(JSON.stringify(baseline.generatedGeometry)===JSON.stringify(selectGeneratedGeometryAuthority(model,mixedItems,'legacy').generatedGeometry),'legacy rollback changed');
const singleUnderMixed=selectGeneratedGeometryAuthority(model,tbItems,'mixed');
assert(singleUnderMixed.decisions.find(value=>value.panelId==='owner')?.authority==='COMPOSED','mixed mode did not retain single-tool authority');
assert(singleUnderMixed.panelCompositionModel==='relationship-composed-single-tool-v1','single-tool marker changed under mixed mode');
const finalGeometry=buildFinalGeometry(model,[...enabled.generatedGeometry]);
assert(!finalGeometry.diagnostics.some(value=>value.severity==='error'),'authoritative mixed FinalGeometry failed');

const conflictAssignments:any={[owner.panel.edgeIds[0]]:{slotAssignments:[{connectionId:'S2',slotRole:'A'}]},[mate.panel.edgeIds[0]]:{slotAssignments:[{connectionId:'S2',slotRole:'B'}]}};
const conflictS=buildGeneratedSGeometryItems(model,conflictAssignments,{S2:{id:'S2',prefix:'S',properties:{slotLengthMm:13,isSlotLengthManual:true,slotOffsetMm:1}}} as any,thickness);
const conflictItems=[...tbItems,...conflictS];
const conflict=selectGeneratedGeometryAuthority(model,conflictItems,'mixed');
assert(conflict.decisions.find(value=>value.panelId==='owner')?.reason==='REPLACEMENT_CONFLICT','same-edge conflict was not rejected');
assert(!conflict.ok && conflict.generatedGeometry.length === 0,'conflict did not fail closed');

const snapshot=createGeneratedGeometrySnapshot({generatedGeometry:[...enabled.generatedGeometry],panelCompositionModel:enabled.panelCompositionModel});
assert(snapshot.metadata.panelCompositionModel==='relationship-composed-mixed-v1','mixed snapshot did not retain marker');
assert(JSON.stringify(snapshot.generatedGeometry)===JSON.stringify(enabled.generatedGeometry),'mixed snapshot did not restore authoritative array');
const oldSnapshot=createGeneratedGeometrySnapshot({generatedGeometry:[...baseline.generatedGeometry]});
assert(oldSnapshot.metadata.panelCompositionModel==='legacy','legacy snapshot compatibility changed');
console.log('mixed authority=PASS single-tool-superset=PASS conflict-fail-closed=PASS slots=PASS downstream=PASS snapshot=PASS rollback=PASS order=PASS');
