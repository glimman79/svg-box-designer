import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { createGeneratedGeometrySnapshot, restoreGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { processManufacturingGeometry } from '../../src/app/manufacturingCompensation';
import { defaultPanelContributorRegistry } from '../../src/app/panelContributors';
import { adaptFingerJointProfilesToPanelContributions } from '../../src/app/tbShadowPanelAdapter';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import { validateWallAuthoringForApply } from '../../src/app/wallAuthoring';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const rectangle = (id: string, x: number) => {
  const contour = [{x,y:0},{x:x+80,y:0},{x:x+80,y:50},{x,y:50}];
  const edgeIds=contour.map((_,i)=>`${id}-e${i}`);
  const panel:SvgPanel={id,contour,outerContour:contour,innerContours:[],edgeIds,outerEdgeIds:edgeIds,innerEdgeIds:[],bounds:{minX:x,minY:0,maxX:x+80,maxY:50}};
  return {panel,edges:contour.map((start,i)=>({id:edgeIds[i],source:id,start,end:contour[(i+1)%4]}))};
};
const panels=[rectangle('w-a',0),rectangle('w-b',120),rectangle('tb-a',240),rectangle('tb-b',360),rectangle('plain',480)];
const model:SvgDocumentModel={content:'',innerMarkup:'',rootAttributes:{width:null,height:null,viewBox:null},viewBox:'0 0 600 100',width:600,height:100,
  panels:panels.map(x=>x.panel),edges:panels.flatMap(x=>x.edges)};
const wallConnections:any={W1:{id:'W1',prefix:'W',properties:{fingerWidthMm:10,isFingerWidthManual:false}}};
const wallAssignments:any={'w-a-e0':{edgeAssignment:{connectionId:'W1',edgeRole:'A'}},'w-b-e0':{edgeAssignment:{connectionId:'W1',edgeRole:'B'}}};
validateWallAuthoringForApply(model,wallAssignments,wallConnections);
const thickness={defaultThicknessMm:3,panels:Object.fromEntries(panels.map(x=>[x.panel.id,{panelId:x.panel.id,thicknessMm:3}]))};
const wallRaw=buildGeneratedWGeometryItems(model,wallAssignments,wallConnections,thickness);
const wallProfiles=wallRaw.flatMap(x=>x.generatedProfiles??[]);
assert(wallProfiles.length===2&&wallProfiles.every(x=>x.generatorType==='W'),'native W profiles missing');
assert(defaultPanelContributorRegistry.get('W')?.adaptProfiles===adaptFingerJointProfilesToPanelContributions,'W is not registered with shared adapter');
assert(defaultPanelContributorRegistry.get('TB')?.adaptProfiles===adaptFingerJointProfilesToPanelContributions,'TB is not registered with shared adapter');
assert(adaptFingerJointProfilesToPanelContributions(wallProfiles).length===2,'shared adapter rejected W');
let unknownRejected=false;
try { adaptFingerJointProfilesToPanelContributions([{...wallProfiles[0],generatorType:'UNKNOWN'} as any]); } catch { unknownRejected=true; }
assert(unknownRejected,'unsupported generator passed the adapter');
const wallAuthority=selectGeneratedGeometryAuthority(model,wallRaw,'single-tool');
assert(wallAuthority.ok&&wallAuthority.generatedGeometry.some(x=>x.generatedProfiles?.some(p=>p.generatorType==='W')),'W authority selection failed');

const tbConnections:any={TB1:{id:'TB1',prefix:'TB',properties:{fingerWidthMm:10,isFingerWidthManual:false}}};
const tbAssignments:any={'tb-a-e0':{edgeAssignment:{connectionId:'TB1',edgeRole:'A'}},'tb-b-e0':{edgeAssignment:{connectionId:'TB1',edgeRole:'B'}}};
const mixedRaw=[...wallRaw,...buildGeneratedTBGeometryItems(model,tbAssignments,tbConnections,thickness)];
const mixedAuthority=selectGeneratedGeometryAuthority(model,mixedRaw,'single-tool');
assert(mixedAuthority.ok&&mixedAuthority.panelCompositionModel==='relationship-composed-single-tool-v1','TB+W mixed authority failed');
const finalGeometry=buildFinalGeometry(model,wallAuthority.generatedGeometry);
assert(finalGeometry.contours.length>0&&!finalGeometry.diagnostics.some(x=>x.severity==='error'),'W FinalGeometry failed');
const ids=wallProfiles.map(x=>x.id);
const manufacturing=processManufacturingGeometry(finalGeometry,.16,.1,-.045,ids,.065);
assert(manufacturing.contours.length>0&&!manufacturing.diagnostics.some(x=>x.severity==='error'),'W manufacturing failed');
const snapshot=createGeneratedGeometrySnapshot({generatedGeometry:[...wallAuthority.generatedGeometry],panelCompositionModel:wallAuthority.panelCompositionModel});
const restored=restoreGeneratedGeometrySnapshot(structuredClone(snapshot));
assert(JSON.stringify(restored.generatedGeometry)===JSON.stringify(wallAuthority.generatedGeometry),'authoritative W snapshot restore failed');
assert(JSON.stringify(buildFinalGeometry(model,restored.generatedGeometry))===JSON.stringify(finalGeometry),'restored W FinalGeometry differs');
console.log('PASS | W Apply authority | TB+W mixed authority | FinalGeometry | manufacturing | authoritative restore | unsupported generator rejected');
