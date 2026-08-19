import { auditGeneratedGeometryRelationships } from '../../src/app/geometryRelationships';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { makeMixedFixture } from './helpers/mixed-evidence-fixture';

type Classification='VALID'|'INVALID'|'CURRENTLY UNSPECIFIED / REQUIRES PRODUCT DECISION';
const cases: readonly [string,string,Classification][]=[
 ['A','S-B references an unchanged/original edge','VALID'],
 ['B','S-B references an edge owned by TB on another panel','CURRENTLY UNSPECIFIED / REQUIRES PRODUCT DECISION'],
 ['C','S-B references an edge owned by S-A from another operation on another panel','CURRENTLY UNSPECIFIED / REQUIRES PRODUCT DECISION'],
 ['D','S-B references an edge owned by TB on the same panel','CURRENTLY UNSPECIFIED / REQUIRES PRODUCT DECISION'],
 ['E','S-B references an edge owned by another S-A on the same panel','CURRENTLY UNSPECIFIED / REQUIRES PRODUCT DECISION'],
 ['F','S-B references an edge involved in an invalid replacement conflict','INVALID'],
];
const base=makeMixedFixture({name:'s-reference',tbEdges:[0],sEdges:[1]});
const slots=base.s.filter(x=>x.kind==='SLOT_PATH');
if(!slots.length)throw new Error('Case A: production S generator emitted no slot');
const references=slots.flatMap(x=>x.sourceRelationships??[]).filter(x=>x.kind==='references');
if(!references.length)throw new Error('Case A: production S slot carries no REFERENCES relationship');
const index=auditGeneratedGeometryRelationships(base.raw);
for(const ref of references){const source=index.sources.find(x=>x.source.panelId===ref.panelId&&x.source.sourceEdgeId===ref.sourceEdgeId);
 if(!source||!source.references.includes(ref.operationId))throw new Error('Case A: REFERENCES was not indexed');
 if(source.replacementOwner)throw new Error('Case A expected unchanged source edge');}
for(const [id,label,classification] of cases){
 const physical=id==='A'?'original source edge':id==='F'?'fail-closed before slot admission':'original source edge (current generator records the imported source edge; no contract selects a composed replacement)';
 console.log(`CASE ${id} | ${classification} | ${label} | current placement basis=${physical}`);
}
const conflict=makeMixedFixture({name:'s-reference-conflict',tbEdges:[0],sEdges:[0]});
const selection=selectGeneratedGeometryAuthority(conflict.model,conflict.raw,'mixed');
if(selection.ok||selection.generatedGeometry.length||!selection.decisions.some(x=>x.reason==='REPLACEMENT_CONFLICT'))throw new Error('Case F did not fail closed');
console.log('S-B REFERENCES evidence: original-source addressing proven; composed-replacement physical semantics B-E remain promotion gaps.');
