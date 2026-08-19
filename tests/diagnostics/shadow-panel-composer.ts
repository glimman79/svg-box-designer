import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { auditGeneratedGeometryRelationships, buildGeometryRelationshipIndex } from '../../src/app/geometryRelationships';
import type { GeometryRelationship } from '../../src/app/geometryRelationships';
import { pathDToClosedContour } from '../../src/app/geometryServices';
import { adaptSProfilesToShadowContributions, composeShadowPanel } from '../../src/app/shadowPanelComposer';
import type { ShadowReplacedEdgeContribution } from '../../src/app/shadowPanelComposer';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const close = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y) < 1e-7;
const rectangle = (id: string, x: number, y: number, clockwise = false) => {
  const ccw = [{x,y},{x:x+100,y},{x:x+100,y:y+70},{x,y:y+70}];
  const contour = clockwise ? [ccw[0],ccw[3],ccw[2],ccw[1]] : ccw;
  const edgeIds = contour.map((_,i)=>`${id}-edge-${i}`);
  const edges = contour.map((start,i)=>({id:edgeIds[i],source:id,start,end:contour[(i+1)%4]}));
  const panel: SvgPanel = {id,contour,outerContour:contour,edgeIds,outerEdgeIds:edgeIds,innerContours:[],innerEdgeIds:[],bounds:{minX:x,maxX:x+100,minY:y,maxY:y+70}};
  return {panel,edges};
};
const run = (name:string, sides:number[], depth:number, clockwise=false, slotLength=20) => {
  const owner=rectangle(`${name}-owner`,0,0,clockwise);
  const mates=sides.map((_,i)=>rectangle(`${name}-mate-${i}`,140+i*120,0,clockwise));
  const panels=[owner.panel,...mates.map(x=>x.panel)]; const assignments:any={}; const connections:any={};
  sides.forEach((side,i)=>{const id=`${name}-${i}`; assignments[owner.panel.edgeIds[side]]={slotAssignments:[{connectionId:id,slotRole:'A'}]}; assignments[mates[i].panel.edgeIds[side]]={slotAssignments:[{connectionId:id,slotRole:'B'}]}; connections[id]={id,prefix:'S',properties:{slotLengthMm:slotLength,isSlotLengthManual:true,slotOffsetMm:1}};});
  const model:SvgDocumentModel={content:'',innerMarkup:'',rootAttributes:{width:null,height:null,viewBox:null},viewBox:'0 0 800 100',width:800,height:100,panels,edges:[...owner.edges,...mates.flatMap(x=>x.edges)]};
  const thickness={defaultThicknessMm:5,panels:Object.fromEntries(panels.map((p,i)=>[p.id,{panelId:p.id,thicknessMm:i?depth:5}]))};
  const items=buildGeneratedSGeometryItems(model,assignments,connections,thickness); const frozen=JSON.stringify(items);
  const index=auditGeneratedGeometryRelationships(items); const panelItem=items.find(x=>x.kind==='PANEL_PATH')!; const slots=items.filter(x=>x.kind==='SLOT_PATH');
  const contributions=adaptSProfilesToShadowContributions(panelItem.generatedProfiles ?? []);
  const candidate=composeShadowPanel(owner.panel,index,[...contributions].reverse(),[...slots].reverse());
  assert(candidate.diagnostics.length===0,`${name}: ${candidate.diagnostics.map(x=>x.message).join('; ')}`);
  const production=pathDToClosedContour(panelItem.pathD)!;
  assert(candidate.points.length===production.length && candidate.points.every((p,i)=>close(p,production[i])),`${name}: coordinate/provenance segment mismatch`);
  assert(candidate.segments.every((s,i)=>s.segmentIndex===i && s.sourceEdgeId),`${name}: provenance is not aligned`);
  assert(candidate.segments.filter(s=>s.profileId).every(s=>s.operationId&&s.elementId&&s.projectionId),`${name}: generated provenance missing`);
  assert(candidate.createdFeatures.length===slots.length&&candidate.createdFeatures.every(x=>x.kind==='SLOT_PATH'),`${name}: CREATES were not kept independent`);
  const again=composeShadowPanel(owner.panel,index,contributions,slots);
  assert(JSON.stringify(candidate)===JSON.stringify(again),`${name}: input order changed output`);
  assert(JSON.stringify(items)===frozen,`${name}: shadow composition mutated production output`);
};

for(const clockwise of [false,true]) for(const side of [0,1,2,3]) run(`${clockwise?'cw':'ccw'}-side-${side}`,[side],3.25,clockwise);
run('depth-24',[0],2.4); run('depth-55',[2],5.5); run('non-adjacent',[0,2],3.25); run('adjacent',[0,1],3.25); run('three',[0,1,3],3.25); run('all',[0,1,2,3],3.25); run('custom-tabs',[3],3.25,false,13);

const source=(kind:'replaces'|'references',operationId:string,panelId:string,sourceEdgeId:string):GeometryRelationship=>({kind,operationId,panelId,sourceEdgeId,provenance:'native-generator-intent',provenanceId:`${kind}:${operationId}`});
const box=rectangle('generic',0,0); const baseIndex=buildGeometryRelationshipIndex([source('references','R3','generic',box.panel.edgeIds[0]),source('references','R1','generic',box.panel.edgeIds[0]),source('references','R2','generic',box.panel.edgeIds[0])]);
assert(composeShadowPanel(box.panel,baseIndex,[]).diagnostics.length===0,'multiple REFERENCES blocked composition');
const conflict=buildGeometryRelationshipIndex([source('replaces','A','generic',box.panel.edgeIds[0]),source('replaces','B','generic',box.panel.edgeIds[0])]);
assert(composeShadowPanel(box.panel,conflict,[]).diagnostics[0]?.kind==='replacement-conflict','replacement conflict did not block composition');
const simple=(edge:number,operationId:string):ShadowReplacedEdgeContribution=>{const a=box.panel.outerContour[edge],b=box.panel.outerContour[(edge+1)%4]; return {kind:'replaced',panelId:'generic',sourceEdgeId:box.panel.edgeIds[edge],operationId,profileId:`profile-${operationId}` as any,sourceTraversal:{start:a,end:b},startSupport:{start:a,end:b},endSupport:{start:a,end:b},startPolicy:'replace-terminal',endPolicy:'replace-terminal',geometry:[{start:a,end:b,profileId:`profile-${operationId}` as any,elementId:`element-${operationId}` as any,projectionId:`projection-${operationId}` as any,tapId:null,tapRole:null}]};};
const mixedIndex=buildGeometryRelationshipIndex([source('replaces','A','generic',box.panel.edgeIds[0]),source('replaces','B','generic',box.panel.edgeIds[1]),source('references','R','generic',box.panel.edgeIds[1])]);
const mixed=composeShadowPanel(box.panel,mixedIndex,[simple(1,'B'),simple(0,'A')]);
assert(!mixed.diagnostics.length&&mixed.segments.filter(x=>x.relationshipOrigin==='replaces').length===2,'different edge owners were not composed');
console.log('Shadow panel composer S-A: PASS');
