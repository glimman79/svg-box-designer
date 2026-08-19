import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
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
if(JSON.stringify(actualRelationships)!==JSON.stringify(expectedRelationships)){
 console.error(`MIXED METADATA PACKAGING DEFECT | smallest reproducer: two mixed PANEL_PATH carriers | expected sourceRelationships=${expectedRelationships.length} actual=${actualRelationships.length}`);
 throw new Error('MIXED METADATA PACKAGING DEFECT: sourceRelationships from later carriers are lost; retained SLOT_PATH does not repair carrier metadata');
}
console.log('Mixed metadata packaging: PASS');
