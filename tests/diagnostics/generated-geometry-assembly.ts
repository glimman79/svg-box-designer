import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { assembleGeneratedGeometryDiagnostics } from '../../src/app/generatedGeometryAssembly';
import { createGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { processManufacturingGeometry } from '../../src/app/manufacturingCompensation';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import type { SourceGeometryRelationship } from '../../src/app/geometryRelationships';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const rectangle = (id:string,x:number) => { const contour=[{x,y:0},{x:x+120,y:0},{x:x+120,y:80},{x,y:80}]; const edgeIds=contour.map((_,i)=>`${id}-edge-${i}`);
  const panel:SvgPanel={id,contour,outerContour:contour,edgeIds,outerEdgeIds:edgeIds,innerContours:[],innerEdgeIds:[],bounds:{minX:x,maxX:x+120,minY:0,maxY:80}};
  return {panel,edges:contour.map((start,i)=>({id:edgeIds[i],source:id,start,end:contour[(i+1)%4]}))}; };
const owner=rectangle('owner',0),mate=rectangle('mate',180); const panels=[owner.panel,mate.panel];
const model:SvgDocumentModel={content:'',innerMarkup:'',rootAttributes:{width:null,height:null,viewBox:null},viewBox:'0 0 400 100',width:400,height:100,panels,edges:[...owner.edges,...mate.edges]};
const thickness={defaultThicknessMm:3.25,panels:{owner:{panelId:'owner',thicknessMm:5},mate:{panelId:'mate',thicknessMm:3.25}}};
const sAssignments:any={[owner.panel.edgeIds[1]]:{slotAssignments:[{connectionId:'S1',slotRole:'A'}]},[mate.panel.edgeIds[1]]:{slotAssignments:[{connectionId:'S1',slotRole:'B'}]}};
const sItems=buildGeneratedSGeometryItems(model,sAssignments,{S1:{id:'S1',prefix:'S',properties:{materialThicknessMm:3.25,slotLengthMm:13,isSlotLengthManual:true,slotOffsetMm:1}}} as any,thickness);
const tbAssignments:any={[owner.panel.edgeIds[0]]:{edgeAssignment:{connectionId:'TB1',edgeRole:'A'}},[mate.panel.edgeIds[0]]:{edgeAssignment:{connectionId:'TB1',edgeRole:'B'}}};
const tbItems=buildGeneratedTBGeometryItems(model,tbAssignments,{TB1:{id:'TB1',prefix:'TB',properties:{materialThicknessMm:3.25,fingerWidthMm:12,isFingerWidthManual:true}}} as any,thickness)
  .filter(item=>item.behaviour.replacesPanelId===owner.panel.id);

const sResult=assembleGeneratedGeometryDiagnostics(model,sItems); const tbResult=assembleGeneratedGeometryDiagnostics(model,tbItems);
assert(sResult.comparisonResults.some(x=>x.panelId==='owner'&&x.status==='MATCH'),'real S stream did not match legacy');
assert(tbResult.comparisonResults.some(x=>x.panelId==='owner'&&x.status==='MATCH'),'real TB stream did not match legacy');
assert(sResult.createdFeatures.length>0&&sResult.createdFeatures.every(x=>x.kind==='SLOT_PATH'),'CREATES were not independent');
const mixedItems=[...tbItems,...sItems]; const mixed=assembleGeneratedGeometryDiagnostics(model,mixedItems);
assert(mixed.comparisonResults.some(x=>x.panelId==='owner'&&x.status==='MIXED_NO_LEGACY_ORACLE'),'mixed stream used legacy as oracle');
assert(new Set(mixed.panelCandidates.find(x=>x.panelId==='owner')?.segments.filter(x=>x.relationshipOrigin==='replaces').map(x=>x.operationId)).size===2,'mixed owners were not both composed');

const frozen=JSON.stringify(mixedItems); const snapshotBefore=createGeneratedGeometrySnapshot({generatedGeometry:mixedItems});
const finalBefore=buildFinalGeometry(model,snapshotBefore); const manufacturingBefore=processManufacturingGeometry(finalBefore,0.12,0.08,0.04,[],0.06);
assembleGeneratedGeometryDiagnostics(model,mixedItems);
assert(JSON.stringify(mixedItems)===frozen,'assembly mutated generatedGeometryItems');
assert(JSON.stringify(createGeneratedGeometrySnapshot({generatedGeometry:mixedItems}).generatedGeometry)===JSON.stringify(snapshotBefore.generatedGeometry),'snapshot changed');
assert(JSON.stringify(buildFinalGeometry(model,snapshotBefore))===JSON.stringify(finalBefore),'FinalGeometry changed');
assert(JSON.stringify(processManufacturingGeometry(finalBefore,0.12,0.08,0.04,[],0.06))===JSON.stringify(manufacturingBefore),'manufacturing stages changed');

const normalized=(result:ReturnType<typeof assembleGeneratedGeometryDiagnostics>)=>JSON.stringify(result.panelCandidates);
assert(normalized(assembleGeneratedGeometryDiagnostics(model,[...mixedItems].reverse()))===normalized(mixed),'candidate depends on generated item order');
const conflictSAssignments:any={[owner.panel.edgeIds[0]]:{slotAssignments:[{connectionId:'S2',slotRole:'A'}]},[mate.panel.edgeIds[0]]:{slotAssignments:[{connectionId:'S2',slotRole:'B'}]}};
const conflictS=buildGeneratedSGeometryItems(model,conflictSAssignments,{S2:{id:'S2',prefix:'S',properties:{materialThicknessMm:3.25,slotLengthMm:13,isSlotLengthManual:true,slotOffsetMm:1}}} as any,thickness);
const conflict=assembleGeneratedGeometryDiagnostics(model,[...tbItems,...conflictS]);
assert(conflict.comparisonResults.some(x=>x.panelId==='owner'&&x.status==='BLOCKED_CONFLICT')&&!conflict.panelCandidates.some(x=>x.panelId==='owner'),'conflict was not atomic');
const replacement=(operationId:string,edge:string):SourceGeometryRelationship=>({kind:'replaces',operationId,panelId:'owner',sourceEdgeId:edge,provenance:'native-generator-intent',provenanceId:`test:${operationId}:${edge}`});
const sPanel=sItems.find(x=>x.kind==='PANEL_PATH')!;
const missing=assembleGeneratedGeometryDiagnostics(model,sItems.map(x=>x===sPanel?{...x,sourceRelationships:[...(x.sourceRelationships??[]),replacement(sPanel.generatedProfiles![0].operationId,owner.panel.edgeIds[2])]}:x));
assert(missing.comparisonResults.some(x=>x.status==='BLOCKED_MISSING_CONTRIBUTION'),'missing contribution was not blocked');
const unsupported=assembleGeneratedGeometryDiagnostics(model,sItems.map(x=>x===sPanel?{...x,sourceRelationships:[...(x.sourceRelationships??[]),replacement('FUTURE',owner.panel.edgeIds[2])]}:x));
assert(unsupported.comparisonResults.some(x=>x.status==='BLOCKED_UNSUPPORTED'),'unsupported contribution was not blocked');
console.log('Generated geometry production assembly: PASS');
