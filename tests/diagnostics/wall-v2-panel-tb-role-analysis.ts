import { getWallAssignments, normalizeWallConnection, resolveTBRoleForPanel, validateWallConnection } from '../../src/app/wallAuthoring';
import { authorWallEdge, startWallGroupWorkflow } from '../../src/app/wallWorkflow';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';
const assert: (v: unknown, m: string) => asserts v = (v,m) => { if (!v) throw new Error(m); };
const panel=(id:string, edgeIds:string[]):SvgPanel=>({id,edgeIds,outerEdgeIds:edgeIds,contour:[],outerContour:[],innerContours:[],innerEdgeIds:[],bounds:{minX:0,minY:0,maxX:1,maxY:1}});
const model={panels:[panel('center',['c1','c2','c3','c4']),panel('top',['ttb','tw1','tw2']),panel('left',['ltb','lw1']),panel('right',['rtb','rw2']),panel('none',['n1','n2'])],edges:[]} as unknown as SvgDocumentModel;
const edge=(connectionId:string,edgeRole:'A'|'B')=>({edgeAssignment:{connectionId,edgeRole}});
const tb=(id:string)=>({id,prefix:'TB' as const,properties:{fingerWidthMm:9,isFingerWidthManual:false}});
let connections:ConnectionMap={TB1:tb('TB1'),TB2:tb('TB2'),TB3:tb('TB3')};
let assignments:EdgeAssignmentRecord={ttb:edge('TB1','A'),c1:edge('TB1','B'),rtb:edge('TB2','B'),c2:edge('TB2','A'),ltb:edge('TB3','B'),c3:edge('TB3','A')};
assert(resolveTBRoleForPanel('top',assignments,connections,model)==='TB_ROLE_A','top A');
assert(resolveTBRoleForPanel('left',assignments,connections,model)==='TB_ROLE_B','left B');
assert(resolveTBRoleForPanel('right',assignments,connections,model)==='TB_ROLE_B','right B');
assert(resolveTBRoleForPanel('none',assignments,connections,model)==='NO_TB_ROLE','none');
const started=startWallGroupWorkflow(connections); connections=started.connections;
assignments={...assignments,tw1:edge('W1','B')};
let result=authorWallEdge(model,assignments,connections,started.activeWallGroup,'W1','lw1');
assert(getWallAssignments(model,result.assignments,'W1').find(x=>x.panelId==='top')?.role==='A','real reversed W1 top A');
assert(getWallAssignments(model,result.assignments,'W1').find(x=>x.panelId==='left')?.role==='B','real reversed W1 left B');
result=authorWallEdge(model,result.assignments,result.connections,result.activeWallGroup,'W2','tw2');
result=authorWallEdge(model,result.assignments,result.connections,result.activeWallGroup,'W2','rw2');
assert(getWallAssignments(model,result.assignments,'W2').find(x=>x.panelId==='top')?.role==='A','real W2 top A');
assert(getWallAssignments(model,result.assignments,'W2').find(x=>x.panelId==='right')?.role==='B','real W2 right B');
assert(result.activeWallGroup.connectionIds.join()==='W1,W2,W3','W1/W2/W3 progression');
const multiple={...assignments,tw2:edge('TB4','A'),n1:edge('TB4','B')};
const with4={...connections,TB4:tb('TB4')};
assert(resolveTBRoleForPanel('top',multiple,with4,model)==='TB_ROLE_A','multiple A evidence');
const conflict={...multiple,tw2:edge('TB4','B'),n1:edge('TB4','A')};
assert(resolveTBRoleForPanel('top',conflict,with4,model)==='AMBIGUOUS_TB_ROLE','A+B ambiguous');
const incomplete={...assignments,n1:edge('TB4','A')};
assert(resolveTBRoleForPanel('none',incomplete,with4,model)==='NO_TB_ROLE','incomplete ignored');
const free:EdgeAssignmentRecord={n1:edge('W9','B'),n2:edge('W9','A')};
assert(normalizeWallConnection(model,free,{W9:{id:'W9',prefix:'W',properties:{}}},'W9')===free,'none/none preserves orientation');
const sameRoleConnections={...connections,W8:{id:'W8',prefix:'W' as const,properties:{}}};
for (const [name, first, second] of [['A/A','top','top2'],['B/B','left','right']] as const) {
  const extraPanel=panel(second,second==='top2'?['t2tb','t2w']:model.panels.find(x=>x.id===second)!.edgeIds);
  const sameModel=second==='top2'?{...model,panels:[...model.panels,extraPanel]}:model;
  const sameAssignments:EdgeAssignmentRecord=second==='top2'
    ? {...assignments,t2tb:edge('TB5','A'),c4:edge('TB5','B'),tw2:edge('W8','A'),t2w:edge('W8','B')}
    : {...assignments,lw1:edge('W8','A'),rw2:edge('W8','B')};
  const sameConnections=second==='top2'?{...sameRoleConnections,TB5:tb('TB5')}:sameRoleConnections;
  const normalized=normalizeWallConnection(sameModel,sameAssignments,sameConnections,'W8');
  assert(normalized===sameAssignments,`${name} preserves first orientation`);
  validateWallConnection(sameModel,normalized,sameConnections,'W8');
  const reversed={...sameAssignments,
    [name==='A/A'?'tw2':'lw1']:edge('W8','B'),[name==='A/A'?'t2w':'rw2']:edge('W8','A')};
  assert(normalizeWallConnection(sameModel,reversed,sameConnections,'W8')===reversed,`${name} preserves reversed orientation`);
  validateWallConnection(sameModel,reversed,sameConnections,'W8');
}
const ambiguousWall={...conflict,tw1:edge('W8','A'),n2:edge('W8','B')};
let ambiguityRejected=false;
try { validateWallConnection(model,ambiguousWall,{...with4,W8:{id:'W8',prefix:'W',properties:{}}},'W8'); } catch { ambiguityRejected=true; }
assert(ambiguityRejected,'single-panel A+B ambiguity must fail closed');
console.log('PASS per-panel TB role resolver and production authoring TOP/LEFT W1 + TOP/RIGHT W2 regression');
