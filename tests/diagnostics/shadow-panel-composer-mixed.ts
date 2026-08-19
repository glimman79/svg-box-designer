/**
 * Read-only proof that independently generated S and TB edge profiles can be
 * adapted and composed against one stable source ring. This is deliberately
 * not an oracle comparison with production's whole-panel last-wins assembly.
 */
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { auditGeneratedGeometryRelationships, buildGeometryRelationshipIndex } from '../../src/app/geometryRelationships';
import type { GeometryRelationship } from '../../src/app/geometryRelationships';
import { adaptSProfilesToShadowContributions, composeShadowPanel } from '../../src/app/shadowPanelComposer';
import type { ShadowPanelCandidate, ShadowReplacedEdgeContribution } from '../../src/app/shadowPanelComposer';
import { adaptTBProfilesToShadowContributions } from '../../src/app/tbShadowPanelAdapter';
import { cornerTouchTolerance, getContourSignedArea, lineIntersection } from '../../src/app/sharedGeometry';
import type { EdgeRole, Point, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };
const close = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= cornerTouchTolerance;
const pointOnLine = (p: Point, line: {start: Point; end: Point}) => Math.abs((p.x-line.start.x)*(line.end.y-line.start.y)-(p.y-line.start.y)*(line.end.x-line.start.x)) <= 1e-6;
const source = (kind: 'replaces'|'references', operationId: string, panelId: string, sourceEdgeId: string): GeometryRelationship =>
  ({ kind, operationId, panelId, sourceEdgeId, provenance: 'native-generator-intent', provenanceId: `${kind}:${operationId}:${sourceEdgeId}` });

const rectangle = (id: string, x: number, y: number, winding: 'CCW'|'CW' = 'CCW') => {
  const ccw = [{x,y},{x:x+120,y},{x:x+120,y:y+80},{x,y:y+80}];
  const contour = winding === 'CCW' ? ccw : [ccw[0],ccw[3],ccw[2],ccw[1]];
  const edgeIds = contour.map((_, i) => `${id}-edge-${i}`);
  const edges = contour.map((start, i) => ({id: edgeIds[i], source: id, start, end: contour[(i+1)%4]}));
  const panel: SvgPanel = {id, contour, outerContour: contour, edgeIds, outerEdgeIds: edgeIds, innerContours: [], innerEdgeIds: [], bounds:{minX:x,maxX:x+120,minY:y,maxY:y+80}};
  return {panel, edges};
};

type Spec = { tb?: Record<number, EdgeRole>; s?: number[]; refs?: Array<{side:number; id:string}>; tbDepth?:number; sDepth?:number; fingerWidth?:number; slotLength?:number; winding?:'CCW'|'CW' };
const generate = (name: string, spec: Spec) => {
  const owner = rectangle(name, 0, 0, spec.winding); const mates = (spec.s ?? []).map((_,i)=>rectangle(`${name}-mate-${i}`,180+i*150,0,spec.winding));
  const tbMates = Object.keys(spec.tb ?? {}).map((_, i) => rectangle(`${name}-tb-mate-${i}`, 600 + i * 150, 0, spec.winding));
  const panels = [owner.panel,...mates.map(x=>x.panel),...tbMates.map(x=>x.panel)]; const edges = [...owner.edges,...mates.flatMap(x=>x.edges),...tbMates.flatMap(x=>x.edges)];
  const model: SvgDocumentModel = {content:'',innerMarkup:'',rootAttributes:{width:null,height:null,viewBox:null},viewBox:'0 0 1000 120',width:1000,height:120,panels,edges};
  const tbAssignments:any={}, tbConnections:any={};
  Object.entries(spec.tb ?? {}).forEach(([raw,role],i)=>{const side=+raw,id=`TB-${name}-tb-${side}`;tbAssignments[owner.panel.edgeIds[side]]={edgeAssignment:{connectionId:id,edgeRole:role}};tbAssignments[tbMates[i].panel.edgeIds[side]]={edgeAssignment:{connectionId:id,edgeRole:role==='A'?'B':'A'}};tbConnections[id]={id,prefix:'TB',properties:{fingerWidthMm:spec.fingerWidth??30,isFingerWidthManual:spec.fingerWidth!==undefined}};});
  const tbItems=buildGeneratedTBGeometryItems(model,tbAssignments,tbConnections,{defaultThicknessMm:spec.tbDepth??2.4,panels:Object.fromEntries([owner.panel,...tbMates.map(x=>x.panel)].map(p=>[p.id,{panelId:p.id,thicknessMm:spec.tbDepth??2.4}]))});
  const sAssignments:any={},sConnections:any={};
  (spec.s??[]).forEach((side,i)=>{const id=`${name}-s-${side}`;sAssignments[owner.panel.edgeIds[side]]={slotAssignments:[{connectionId:id,slotRole:'A'}]};sAssignments[mates[i].panel.edgeIds[side]]={slotAssignments:[{connectionId:id,slotRole:'B'}]};sConnections[id]={id,prefix:'S',properties:{slotLengthMm:spec.slotLength??20,isSlotLengthManual:spec.slotLength!==undefined,slotOffsetMm:1}};});
  const thickness={defaultThicknessMm:spec.sDepth??2.4,panels:Object.fromEntries(panels.map((p,i)=>[p.id,{panelId:p.id,thicknessMm:i?spec.sDepth??2.4:5}]))};
  const sItems=buildGeneratedSGeometryItems(model,sAssignments,sConnections,thickness);
  const tbProfiles=tbItems.flatMap(x=>x.generatedProfiles??[]).filter(x=>x.panelId===owner.panel.id);
  const sProfiles=sItems.flatMap(x=>x.generatedProfiles??[]).filter(x=>x.panelId===owner.panel.id);
  const tb=adaptTBProfilesToShadowContributions(tbProfiles), s=adaptSProfilesToShadowContributions(sProfiles);
  const relationships=[...auditGeneratedGeometryRelationships([...tbItems,...sItems]).relationships,...(spec.refs??[]).map(r=>source('references',r.id,owner.panel.id,owner.panel.edgeIds[r.side]))];
  const index=buildGeometryRelationshipIndex(relationships); const slots=sItems.filter(x=>x.kind==='SLOT_PATH');
  return {owner, tbItems, sItems, tb, s, slots, index, candidate:composeShadowPanel(owner.panel,index,[...tb,...s],slots)};
};

const intersects = (a:{start:Point;end:Point},b:{start:Point;end:Point}) => {
  const p=lineIntersection(a,b); if(!p)return false;
  const within=(v:number,x:number,y:number)=>v>=Math.min(x,y)-1e-7&&v<=Math.max(x,y)+1e-7;
  const onBoth=within(p.x,a.start.x,a.end.x)&&within(p.y,a.start.y,a.end.y)&&within(p.x,b.start.x,b.end.x)&&within(p.y,b.start.y,b.end.y);
  // Touching a previously visited vertex is not a crossing. TB-B's native
  // edge-local profile can retain such neutral terminal touches.
  return onBoth && ![a.start,a.end].some(x=>close(x,p)) && ![b.start,b.end].some(x=>close(x,p));
};
const normalized = (candidate: ShadowPanelCandidate) => JSON.stringify({
  ...candidate, points:candidate.points.map(p=>[+p.x.toFixed(8),+p.y.toFixed(8)]),
  junctions:candidate.junctions.map(j=>({...j,point:[+j.point.x.toFixed(8),+j.point.y.toFixed(8)]})),
  segments:candidate.segments.map(s=>({...s,start:[+s.start.x.toFixed(8),+s.start.y.toFixed(8)],end:[+s.end.x.toFixed(8),+s.end.y.toFixed(8)]}))
});
const verify = (name:string, fixture:ReturnType<typeof generate>) => {
  const {owner,index,candidate,tb,s,slots}=fixture;
  assert(!candidate.diagnostics.length,`${name}: ${candidate.diagnostics.map(x=>x.message).join('; ')}`);
  assert(candidate.points.length>3&&Number.isFinite(getContourSignedArea([...candidate.points]))&&Math.abs(getContourSignedArea([...candidate.points]))>1e-7,`${name}: invalid area`);
  assert(Math.sign(getContourSignedArea([...candidate.points]))===Math.sign(getContourSignedArea([...owner.panel.outerContour])),`${name}: winding changed`);
  assert(candidate.segments.every((x,i)=>x.segmentIndex===i&&x.panelId===owner.panel.id&&!close(x.start,x.end)),`${name}: provenance/zero extent`);
  candidate.segments.forEach((segment,i)=>assert(close(segment.end,candidate.segments[(i+1)%candidate.segments.length].start),`${name}: discontinuity ${i}`));
  const byEdge=new Map(owner.panel.outerEdgeIds.map(id=>[id,index.sources.find(v=>v.source.panelId===owner.panel.id&&v.source.sourceEdgeId===id)]));
  candidate.segments.forEach(segment=>{const view=byEdge.get(segment.sourceEdgeId);if(segment.relationshipOrigin==='unchanged')assert(!view?.replacementOwner&&segment.operationId===null&&segment.profileId===null,`${name}: invalid unchanged owner`);else assert(view?.replacementOwner===segment.operationId,`${name}: replacement owner mismatch`);assert(!(view?.references??[]).includes(segment.operationId??''),`${name}: reference physically owns segment`);});
  owner.panel.outerEdgeIds.forEach(id=>assert(candidate.segments.some(x=>x.sourceEdgeId===id),`${name}: source edge omitted`));
  for(let i=0;i<candidate.segments.length;i++)for(let j=i+1;j<candidate.segments.length;j++){if(j===i+1||(i===0&&j===candidate.segments.length-1))continue;assert(!intersects(candidate.segments[i],candidate.segments[j]),`${name}: self intersection ${i}/${j}`);}
  assert(candidate.createdFeatures.length===slots.length&&candidate.createdFeatures.every(x=>x.kind==='SLOT_PATH'),`${name}: created feature leaked/lost`);
  const contributionByEdge=new Map([...tb,...s].map(c=>[c.sourceEdgeId,c]));
  candidate.junctions.forEach(j=>{const previous=contributionByEdge.get(j.beforeEdgeId),current=contributionByEdge.get(j.afterEdgeId);if(previous&&current&&((tb as readonly unknown[]).includes(previous)!==(tb as readonly unknown[]).includes(current))){
    assert(pointOnLine(j.point,previous.endSupport)&&pointOnLine(j.point,current.startSupport),`${name}: cross support miss`);
    console.log('cross-tool junction',JSON.stringify({previousSourceEdgeId:j.beforeEdgeId,previousOperationId:previous.operationId,previousProfileId:previous.profileId,previousAdapterOrigin:tb.includes(previous)?'TB':'S-A',previousEndSupport:previous.endSupport,currentSourceEdgeId:j.afterEdgeId,currentOperationId:current.operationId,currentProfileId:current.profileId,currentAdapterOrigin:tb.includes(current)?'TB':'S-A',currentStartSupport:current.startSupport,resolvedJ:j.point,onPreviousSupport:true,onCurrentSupport:true}));
  }});
  const again=composeShadowPanel(owner.panel,buildGeometryRelationshipIndex([...index.relationships].reverse()),[...s].reverse().concat([...tb].reverse()),[...slots].reverse());
  assert(normalized(candidate)===normalized(again),`${name}: input order dependence`);
};

const cases:Array<[string,Spec]>=[
  ['tb-to-s',{tb:{0:'A'},s:[1]}],['s-to-tb',{s:[0],tb:{1:'A'}}],['tbb-to-s',{tb:{0:'B'},s:[1]}],['s-to-tbb',{s:[0],tb:{1:'B'}}],
  ['non-adjacent',{tb:{0:'A'},s:[2]}],['three-owner',{tb:{0:'A',2:'B'},s:[1]}],['all-owned',{tb:{0:'A',2:'B'},s:[1,3]}],
  ['depth-55-24',{tb:{0:'A'},s:[1],tbDepth:5.5,sDepth:2.4}],['depth-24-55',{tb:{0:'B'},s:[1],tbDepth:2.4,sDepth:5.5}],['depth-325-55-custom',{tb:{0:'A'},s:[1],tbDepth:3.25,sDepth:5.5,fingerWidth:12,slotLength:13}],
];
for(const [name,spec] of cases)verify(name,generate(name,spec));
for(const winding of ['CCW','CW'] as const)for(let side=0;side<4;side++)verify(`rotation-${winding}-${side}`,generate(`rotation-${winding}-${side}`,{tb:{[side]:'A'},s:[(side+1)%4],winding}));

const conflict=generate('same-edge-conflict',{tb:{0:'A'},s:[0]});
assert(conflict.candidate.diagnostics.some(x=>x.kind==='replacement-conflict')&&!conflict.candidate.segments.length,'same-edge conflict did not block');
const tbRef=generate('tb-reference',{tb:{0:'A'},refs:[{side:0,id:'S-B-reference'}]}); verify('tb-reference',tbRef);
const sRef=generate('s-reference',{s:[0],refs:[{side:0,id:'S-B-reference'}]}); verify('s-reference',sRef);
const manyRefs=generate('many-references',{tb:{0:'B'},refs:[{side:0,id:'R1'},{side:0,id:'R2'},{side:0,id:'R3'}]}); verify('many-references',manyRefs);
assert(manyRefs.index.sources.find(x=>x.source.sourceEdgeId===manyRefs.owner.panel.edgeIds[0])?.references.length===3,'multiple references lost');
assert(sRef.slots.length>0&&sRef.index.features.length===sRef.slots.length,'real S-B CREATES not indexed');

console.log('reference geometry',JSON.stringify({semanticTarget:'panelId + original sourceEdgeId',physicalPlacementToday:'original source support; S slots are generated before mixed shadow composition'}));
console.log('production',JSON.stringify({assembly:'whole-panel last-PANEL_PATH-wins',representativeWinner:'S PANEL_PATH when TB items precede S items'}));
console.log('shadow',JSON.stringify({assembly:'one contribution selected per source edge from validated REPLACES ownership',contractSufficient:true,connectorsInvented:false,junctionOwnerRequired:false}));
console.log('Shadow panel composer mixed-owner/cross-adapter: PASS');
