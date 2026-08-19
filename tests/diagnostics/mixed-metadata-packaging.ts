import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { packageComposedPanelGeometry } from '../../src/app/generatedGeometryDualRun';
import { assembleGeneratedGeometryDiagnostics } from '../../src/app/generatedGeometryAssembly';
import { geometryRelationshipKey } from '../../src/app/geometryRelationships';
import { makeMixedFixture } from './helpers/mixed-evidence-fixture';

const f=makeMixedFixture({name:'metadata',tbEdges:[0],sEdges:[1]});
const instrumented=f.raw.map((item,index)=>item.kind==='PANEL_PATH'&&item.behaviour.replacesPanelId===f.ownerPanelId
 ? {...item,sourceRelationships:[...(item.sourceRelationships??[]),{kind:'references' as const,operationId:item.operationId,
   panelId:f.ownerPanelId,sourceEdgeId:`packaging-reference-${index}`,provenance:'native-generator-intent' as const,provenanceId:`carrier-${index}`}]}
 : item);
const result=selectGeneratedGeometryAuthority(f.model,instrumented,'mixed');
if(!result.ok)throw new Error('metadata reproducer did not reach packaging');
const rawCarriers=instrumented.filter(x=>x.kind==='PANEL_PATH'&&x.behaviour.replacesPanelId===f.ownerPanelId);
const composed=result.generatedGeometry.find(x=>x.id===`composed:panel:${f.ownerPanelId}`);
if(!composed)throw new Error('composed carrier absent');
const ids=(values:readonly {id:string}[]|undefined)=>[...(values??[])].map(x=>x.id).sort();
const union=(field:'generatedProfiles'|'generatedTaps'|'profileGroups')=>[...new Set(rawCarriers.flatMap(x=>ids(x[field] as any)))].sort();
for(const field of ['generatedProfiles','generatedTaps','profileGroups'] as const){if(JSON.stringify(ids(composed[field] as any))!==JSON.stringify(union(field)))throw new Error(`${field} union was not preserved`);}
console.log('PASS | carrier 1/2 unique metadata | duplicate IDs deduplicated | conflicting IDs fail by production contract');
const expectedRelationships=rawCarriers.flatMap(x=>x.sourceRelationships??[]);
const actualRelationships=composed.sourceRelationships??[];
const orderedExpected=[...expectedRelationships].sort((a,b)=>geometryRelationshipKey(a).localeCompare(geometryRelationshipKey(b)));
if(JSON.stringify(actualRelationships)!==JSON.stringify(orderedExpected)){
 console.error(`MIXED METADATA PACKAGING DEFECT | smallest reproducer: two mixed PANEL_PATH carriers | expected sourceRelationships=${expectedRelationships.length} actual=${actualRelationships.length}`);
 throw new Error('MIXED METADATA PACKAGING DEFECT: sourceRelationships from later carriers are lost; retained SLOT_PATH does not repair carrier metadata');
}
const assembly=assembleGeneratedGeometryDiagnostics(f.model,instrumented);
const candidate=assembly.panelCandidates.find(x=>x.panelId===f.ownerPanelId);
const owners=assembly.panelDiagnostics.find(x=>x.panelId===f.ownerPanelId)?.replacementOperationIds;
if(!candidate||!owners)throw new Error('metadata packaging fixture lacks a candidate');
const packaged=(items:typeof instrumented)=>packageComposedPanelGeometry(items,candidate,owners)
 .find(x=>x.id===`composed:panel:${f.ownerPanelId}`)?.sourceRelationships;
if(JSON.stringify(packaged([...instrumented].reverse()))!==JSON.stringify(actualRelationships))throw new Error('carrier reversal changed sourceRelationships');
const panelCarrierIndexes=instrumented.map((x,index)=>x.kind==='PANEL_PATH'&&x.behaviour.replacesPanelId===f.ownerPanelId?index:-1).filter(index=>index>=0);
const duplicate=actualRelationships[0];
if(!duplicate||panelCarrierIndexes.length<2)throw new Error('metadata packaging fixture lacks two relationship carriers');
const duplicated=instrumented.map((item,index)=>index===panelCarrierIndexes[1]
 ? {...item,sourceRelationships:[...(item.sourceRelationships??[]),duplicate]}:item);
if((packaged(duplicated)?.filter(x=>geometryRelationshipKey(x)===geometryRelationshipKey(duplicate)).length??0)!==1)throw new Error('identical relationship was not deduplicated');
const conflicting=instrumented.map((item,index)=>index===panelCarrierIndexes[1]
 ? {...item,sourceRelationships:[...(item.sourceRelationships??[]),{...duplicate,provenanceId:`${duplicate.provenanceId}:conflict`}]}:item);
let conflict='';
try{packaged(conflicting);}catch(error){conflict=error instanceof Error?error.message:String(error);}
if(!conflict.includes(`Conflicting source relationship ${geometryRelationshipKey(duplicate)} for ${f.ownerPanelId}.`))throw new Error('conflicting relationship did not fail deterministically');
console.log('PASS | carrier reversal stable | identical relationship deduplicated | conflicting relationship rejected');
console.log('Mixed metadata packaging: PASS');
