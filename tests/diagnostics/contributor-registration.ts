import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { processManufacturingGeometry } from '../../src/app/manufacturingCompensation';
import { createGeneratedProfile } from '../../src/app/generatedProfiles';
import type { GeneratedProfile } from '../../src/app/generatedProfiles';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import { createExtensionPanelContributorType, createPanelContributorRegistry, defaultPanelContributorRegistry } from '../../src/app/panelContributors';
import type { PanelContributorDefinition } from '../../src/app/panelContributors';
import type { PanelReplacedEdgeContribution } from '../../src/app/panelComposer';
import { pointsToClosedPathD } from '../../src/app/sharedGeometry';
import { auditGeneratedGeometryRelationships } from '../../src/app/geometryRelationships';
import { createGeneratedGeometrySnapshot, restoreGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { packageComposedPanelGeometry } from '../../src/app/generatedGeometryDualRun';
import { makeMixedFixture } from './helpers/mixed-evidence-fixture';

const TEST_W=createExtensionPanelContributorType('TEST_W');
const UNKNOWN=createExtensionPanelContributorType('UNKNOWN_TEST');
const assert:(value:unknown,message:string)=>asserts value=(value,message)=>{if(!value)throw new Error(message);};
const adapt=(profiles:readonly GeneratedProfile[]):readonly PanelReplacedEdgeContribution[]=>profiles.map(profile=>{
  const projection=profile.geometryProjections[0];
  if(!projection)throw new Error(`Synthetic profile ${profile.id} has no boundary projection.`);
  return {kind:'replaced',panelId:profile.panelId,sourceEdgeId:profile.sourceEdgeId,operationId:profile.operationId,profileId:profile.id,
    sourceTraversal:{...profile.sourceEdgeDirection},startSupport:{start:{...profile.attachmentStart},end:{...profile.attachmentEnd}},
    endSupport:{start:{...profile.attachmentStart},end:{...profile.attachmentEnd}},startPolicy:'replace-terminal',endPolicy:'replace-terminal',
    geometry:[{start:{...projection.start},end:{...projection.end},profileId:profile.id,elementId:projection.elementId,
      projectionId:projection.id,tapId:null,tapRole:null}]};
});
const definition:PanelContributorDefinition={contributorType:TEST_W,adaptProfiles:adapt};
const registry=createPanelContributorRegistry([...defaultPanelContributorRegistry.values(),definition]);

const syntheticCarrier=(f:ReturnType<typeof makeMixedFixture>,edgeIndex:number,type=TEST_W):GeneratedGeometryItem=>{
  const panel=f.model.panels.find(value=>value.id===f.ownerPanelId)!;
  const edgeId=panel.edgeIds[edgeIndex], edge=f.model.edges.find(value=>value.source===panel.id&&value.id===edgeId)!;
  const operationId=`operation:${type}:${panel.id}:${edgeId}`;
  const baseProfile=createGeneratedProfile({toolType:type,connectionId:`connection:${type}`,operationId,panelId:panel.id,sourceEdgeId:edgeId,
    sourceEdgeStart:edge.start,sourceEdgeEnd:edge.end,attachmentStart:edge.start,attachmentEnd:edge.end,taps:[]});
  const profile={...baseProfile,orderedElements:baseProfile.orderedElements.slice(0,1),geometryProjections:baseProfile.geometryProjections.slice(0,1),
    trailingBoundaryRun:baseProfile.leadingBoundaryRun};
  const pathD=pointsToClosedPathD([...panel.contour]);
  return {id:`carrier:${type}:${panel.id}`,operationId,toolType:type,kind:'PANEL_PATH',source:{operationId,panelIds:[panel.id],edgeIds:[edgeId],connectionIds:[`connection:${type}`]},
    geometry:{type:'path',pathD},behaviour:{assembly:'panel-boundary',replacesPanelId:panel.id},manufacturingClassification:'GENERATED_OUTER',pathD,diagnostics:[],generatedProfiles:[profile]};
};
const run=(name:string,tbEdges:readonly number[],sEdges:readonly number[],testEdge:number)=>{
  const f=makeMixedFixture({name,tbEdges,sEdges}); const raw=[...f.raw,syntheticCarrier(f,testEdge)];
  const result=selectGeneratedGeometryAuthority(f.model,raw,'mixed',undefined,registry);
  assert(result.ok,`${name}: ${result.blockingDecisions.map(x=>`${x.cohort}/${x.reason}`).join(',')}`);
  const decision=result.decisions.find(x=>x.panelId===f.ownerPanelId); assert(decision?.authority==='COMPOSED',`${name}: not composed`);
  const expectedTypes=new Set([...tbEdges.map(()=> 'TB'),...sEdges.map(()=> 'S'),TEST_W]);
  assert(decision.cohort===(expectedTypes.size>1?'MIXED':'REGISTERED_SINGLE'),`${name}: cohort=${decision.cohort}`);
  const owners=auditGeneratedGeometryRelationships(raw).sources.filter(x=>x.source.panelId===f.ownerPanelId&&x.replacementOwner);
  assert(owners.length===tbEdges.length+sEdges.length+1,`${name}: owners=${owners.length}`);
  const final=buildFinalGeometry(f.model,result.generatedGeometry); assert(!final.diagnostics.some(x=>x.severity==='error'),`${name}: FinalGeometry`);
  assert(processManufacturingGeometry(final,.1,.1,0,[],0).contours.length>0,`${name}: manufacturing`);
  const snapshot=createGeneratedGeometrySnapshot({generatedGeometry:[...result.generatedGeometry],panelCompositionModel:result.panelCompositionModel});
  const restored=restoreGeneratedGeometrySnapshot(structuredClone(snapshot));
  assert(JSON.stringify(restored.generatedGeometry)===JSON.stringify(result.generatedGeometry)&&restored.panelCompositionModel===result.panelCompositionModel,`${name}: restore`);
  console.log(`PASS | ${name} | cohort=${decision.cohort} | owners=${owners.length}`);
  return {f,raw,result};
};
run('synthetic-only',[],[],0);
run('tb-synthetic',[0],[],1);
run('s-synthetic',[],[0],1);
const triple=run('tb-s-synthetic',[0],[1],2);

const tb=triple.raw.filter(x=>x.toolType==='TB'),s=triple.raw.filter(x=>x.toolType==='S'),w=triple.raw.filter(x=>x.toolType===TEST_W);
const packaged=[ [...tb,...s,...w], [...w,...tb,...s], [...s,...w,...tb] ].map(items=>selectGeneratedGeometryAuthority(triple.f.model,items,'mixed',undefined,registry));
assert(packaged.every(x=>x.ok),'three-carrier permutation rejected');
const semantic=(x:(typeof packaged)[number])=>JSON.stringify(x.generatedGeometry);
assert(packaged.every(x=>semantic(x)===semantic(packaged[0])),'three-carrier ordering changed packaged semantics');
const candidate=triple.result.diagnostics.panelCandidates.find(x=>x.panelId===triple.f.ownerPanelId)!;
const duplicateCarrier={...w[0],id:`${w[0].id}:duplicate-carrier`};
const duplicate=packageComposedPanelGeometry([...triple.raw,duplicateCarrier],candidate,triple.result.decisions.find(x=>x.panelId===triple.f.ownerPanelId)!.relationshipOwners);
const composedDuplicate=duplicate.find(x=>x.id===`composed:panel:${triple.f.ownerPanelId}`)!;
const profileIds=composedDuplicate.generatedProfiles?.map(x=>x.id)??[];
assert(new Set(profileIds).size===profileIds.length&&profileIds.filter(x=>x===w[0].generatedProfiles![0].id).length===1,'identical duplicate metadata was not deduplicated');
const changedProfile={...w[0].generatedProfiles![0],attachmentStart:{x:999,y:999}};
const conflicting={...duplicateCarrier,generatedProfiles:[changedProfile]};
let conflict='';try{packageComposedPanelGeometry([...triple.raw,conflicting],candidate,triple.result.decisions.find(x=>x.panelId===triple.f.ownerPanelId)!.relationshipOwners);}catch(error){conflict=error instanceof Error?error.message:String(error);}
assert(conflict.includes('Conflicting generated profile'),'conflicting stable metadata ID did not fail deterministically');
console.log('PASS | three-carrier permutations/deduplication/conflicting stable ID');

const unknown=makeMixedFixture({name:'unknown',tbEdges:[],sEdges:[]});
const rejected=selectGeneratedGeometryAuthority(unknown.model,[syntheticCarrier(unknown,0,UNKNOWN)],'mixed',undefined,registry);
assert(!rejected.ok&&rejected.generatedGeometry.length===0,'unregistered contributor did not fail closed');
assert(rejected.blockingDecisions[0]?.reason==='UNSUPPORTED_CONTRIBUTOR','unregistered diagnostic changed');
console.log('PASS | unknown contributor | deterministic fail-closed');

const referenceFixture=makeMixedFixture({name:'four-claims',tbEdges:[0],sEdges:[]});
const panel=referenceFixture.model.panels.find(x=>x.id===referenceFixture.ownerPanelId)!;
const tbProfile=referenceFixture.tb.flatMap(x=>x.generatedProfiles??[]).find(x=>x.panelId===panel.id)!;
const references=['S1','S2','TEST_W'].map(id=>({kind:'references' as const,operationId:id,panelId:panel.id,sourceEdgeId:tbProfile.sourceEdgeId,
  provenance:'native-generator-intent' as const,provenanceId:`reference:${id}`}));
referenceFixture.tb[0].sourceRelationships=[...(referenceFixture.tb[0].sourceRelationships??[]),...references];
const view=auditGeneratedGeometryRelationships(referenceFixture.tb).sources.find(x=>x.source.panelId===panel.id&&x.source.sourceEdgeId===tbProfile.sourceEdgeId);
assert(view?.replacementOwner===tbProfile.operationId&&view.references.length===3,'one owner plus three references invalid');
console.log('PASS | TB owner plus S1/S2/TEST_W references');
