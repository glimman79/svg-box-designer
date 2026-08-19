import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { auditGeneratedGeometryRelationships } from '../../src/app/geometryRelationships';
import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { processManufacturingGeometry } from '../../src/app/manufacturingCompensation';
import { createGeneratedGeometrySnapshot, restoreGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { canonical, makeMixedFixture, type MixedSpec } from './helpers/mixed-evidence-fixture';

const specs: MixedSpec[]=[
 {name:'adjacent TB to S CW',tbEdges:[0],sEdges:[1]}, {name:'adjacent S to TB CCW',tbEdges:[1],sEdges:[0],winding:'CCW'},
 {name:'opposite TB S CW',tbEdges:[0],sEdges:[2]}, {name:'TB S TB CW',tbEdges:[0,2],sEdges:[1]},
 {name:'S TB S CCW',tbEdges:[1],sEdges:[0,2],winding:'CCW'}, {name:'alternating four CW',tbEdges:[0,2],sEdges:[1,3]},
 {name:'alternating four CCW',tbEdges:[0,2],sEdges:[1,3],winding:'CCW'},
 {name:'reverse TB',tbEdges:[0],sEdges:[1],reverseTB:true}, {name:'reverse S-A',tbEdges:[0],sEdges:[1],reverseSA:true},
 {name:'reverse S-B',tbEdges:[0],sEdges:[1],reverseSB:true}, {name:'reverse TB S-A',tbEdges:[0],sEdges:[1],reverseTB:true,reverseSA:true},
 {name:'reverse TB S-B',tbEdges:[0],sEdges:[1],reverseTB:true,reverseSB:true}, {name:'reverse S-A S-B',tbEdges:[0],sEdges:[1],reverseSA:true,reverseSB:true},
 {name:'reverse all',tbEdges:[0],sEdges:[1],reverseTB:true,reverseSA:true,reverseSB:true},
 {name:'translated',tbEdges:[0],sEdges:[1],x:337,y:219}, {name:'unequal dimensions',tbEdges:[0],sEdges:[1],width:173,height:61},
 {name:'automatic sizing positive slot',tbEdges:[0],sEdges:[1],slotOffset:1.1},
 {name:'manual sizing zero slot',tbEdges:[0],sEdges:[1],manualTB:true,manualS:true,slotOffset:0},
 {name:'automatic TB negative slot',tbEdges:[0],sEdges:[1],slotOffset:-1.1},
];
const failures:string[]=[];
const check=(spec:MixedSpec)=>{const f=makeMixedFixture(spec); const result=selectGeneratedGeometryAuthority(f.model,f.raw,'mixed');
 if(!result.ok) throw new Error(`authority=${result.blockingDecisions.map(x=>x.reason).join(',')}`);
 const decision=result.decisions.find(x=>x.panelId===f.ownerPanelId); if(decision?.reason!=='MIXED_APPROVED') throw new Error(`owner decision=${decision?.reason}`);
 if(result.panelCompositionModel!=='relationship-composed-mixed-v1') throw new Error('mixed marker absent');
 const relationships=auditGeneratedGeometryRelationships(f.raw); const ownerSources=relationships.sources.filter(x=>x.source.panelId===f.ownerPanelId);
 if(ownerSources.some(x=>x.replacementClaimants.length!==1)) throw new Error('duplicate or missing relationship owner');
 const carrier=result.generatedGeometry.filter(x=>x.kind==='PANEL_PATH'&&x.behaviour.replacesPanelId===f.ownerPanelId);
 if(carrier.length!==1) throw new Error(`authoritative carriers=${carrier.length}`);
 const profiles=carrier.flatMap(x=>x.generatedProfiles??[]); if(!profiles.some(x=>x.generatorType==='TB')||!profiles.some(x=>x.generatorType==='S')) throw new Error('TB/S profile identity missing');
 const rawSlots=f.raw.filter(x=>x.kind==='SLOT_PATH'); const slots=result.generatedGeometry.filter(x=>x.kind==='SLOT_PATH'); if(canonical(slots)!==canonical(rawSlots)) throw new Error('SLOT_PATH identity changed');
 if(slots.some(x=>x.behaviour.assembly!=='slot-cutout'||!x.behaviour.ownerPanelId||!(x.sourceRelationships??[]).some(r=>r.kind==='references'))) throw new Error('slot semantics incomplete');
 const final=buildFinalGeometry(f.model,result.generatedGeometry); if(final.diagnostics.some(x=>x.severity==='error')) throw new Error('FinalGeometry diagnostic');
 const ids=profiles.map(x=>x.id); for(const args of [[0,0,-.045,ids.slice(0,1),0],[0,0,0,[],.065],[0,.10,0,[],0],[.16,0,0,[],0],[.16,.10,-.045,ids,.065]] as const){const m=processManufacturingGeometry(final,args[0],args[1],args[2],args[3],args[4]);if(!m.contours.length)throw new Error(`manufacturing stage ${args} empty`);}
 const snap=createGeneratedGeometrySnapshot({generatedGeometry:[...result.generatedGeometry],panelCompositionModel:result.panelCompositionModel}); const restored=restoreGeneratedGeometrySnapshot(structuredClone(snap));
 if(canonical(restored.generatedGeometry)!==canonical(result.generatedGeometry))throw new Error('restore changed generated items');
 if(canonical(buildFinalGeometry(f.model,restored.generatedGeometry))!==canonical(final))throw new Error('restore changed FinalGeometry');
 const reordered=selectGeneratedGeometryAuthority(f.model,[...f.raw].reverse(),'mixed'); if(!reordered.ok||canonical(buildFinalGeometry(f.model,reordered.generatedGeometry))!==canonical(final))throw new Error('raw item order changed FinalGeometry');
 console.log(`PASS | ${spec.name} | owners=${ownerSources.length} profiles=${profiles.length} slots=${slots.length}`);};
for(const spec of specs){try{check(spec)}catch(e){failures.push(`${spec.name}: ${e instanceof Error?e.message:e}`);console.error(`FAIL | fixture=${spec.name} | stage=evidence | panel=${spec.name}-owner | winding=${spec.winding??'CW'} | reversal=TB:${!!spec.reverseTB},SA:${!!spec.reverseSA},SB:${!!spec.reverseSB} | transform=${spec.x??20},${spec.y??20} | parameter=${spec.manualTB||spec.manualS?'manual':'automatic'} | expected owner=TB+S | actual owner=see authority diagnostics | expected/actual profile,tap,slot IDs=see fixture output`);}}
if(failures.length)throw new Error(`Mixed evidence collected ${failures.length} failure(s):\n${failures.join('\n')}`);
console.log(`Mixed authority production evidence: PASS (${specs.length} valid mixed fixtures)`);
