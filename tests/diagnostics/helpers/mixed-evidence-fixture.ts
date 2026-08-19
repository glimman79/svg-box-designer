import { buildGeneratedSGeometryItems } from '../../../src/app/sGeometry';
import { buildGeneratedTBGeometryItems } from '../../../src/app/tbGeometry';
import type { GeneratedGeometryItem } from '../../../src/app/generatedGeometryTypes';
import type { SvgDocumentModel, SvgPanel } from '../../../src/svgUtils';

export type Winding = 'CW' | 'CCW';
export type MixedSpec = Readonly<{ name: string; tbEdges: readonly number[]; sEdges: readonly number[];
  winding?: Winding; reverseTB?: boolean; reverseSA?: boolean; reverseSB?: boolean; manualTB?: boolean;
  manualS?: boolean; slotOffset?: number; x?: number; y?: number; width?: number; height?: number }>;

export const makeEvidenceRectangle = (id: string, x: number, y: number, width: number, height: number, winding: Winding = 'CW', reverse = false) => {
  const cw = [{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}];
  const contour = winding === 'CW' ? cw : [cw[0],cw[3],cw[2],cw[1]];
  const edgeIds = contour.map((_,i)=>`${id}-edge-${i}`);
  const panel: SvgPanel = {id,contour,outerContour:contour,edgeIds,outerEdgeIds:edgeIds,innerContours:[],innerEdgeIds:[],
    bounds:{minX:x,maxX:x+width,minY:y,maxY:y+height}};
  return {panel,edges:contour.map((start,i)=>({id:edgeIds[i],source:id,start:reverse?contour[(i+1)%4]:start,end:reverse?start:contour[(i+1)%4]}))};
};

export const makeMixedFixture = (spec: MixedSpec) => {
  const winding=spec.winding??'CW', width=spec.width??120, height=spec.height??80, x=spec.x??20, y=spec.y??20;
  const owner=makeEvidenceRectangle(`${spec.name}-owner`,x,y,width,height,winding,false);
  const rectangles=[owner]; const tbAssignments:any={},sAssignments:any={},tbConnections:any={},sConnections:any={};
  spec.tbEdges.forEach((edge,index)=>{const id=`${spec.name}-TB-${index}`; const mate=makeEvidenceRectangle(`${id}-mate`,x+220,y+index*130,width,height,winding,!!spec.reverseTB); rectangles.push(mate);
    tbAssignments[owner.panel.edgeIds[edge]]={edgeAssignment:{connectionId:id,edgeRole:index%2?'B':'A'}};
    tbAssignments[mate.panel.edgeIds[(edge+2)%4]]={edgeAssignment:{connectionId:id,edgeRole:index%2?'A':'B'}};
    tbConnections[id]={id,prefix:'TB',properties:{fingerWidthMm:11.3+index,isFingerWidthManual:!!spec.manualTB}};});
  spec.sEdges.forEach((edge,index)=>{const id=`${spec.name}-S-${index}`;
    const mate=makeEvidenceRectangle(`${id}-mate`,x+500,y+index*130,width,height,winding,!!spec.reverseSB); rectangles.push(mate);
    // The owner panel is the A side; its independently reversed edge record is substituted below.
    if(spec.reverseSA){const prior=owner.edges[edge]; owner.edges[edge]={...prior,start:prior.end,end:prior.start};}
    sAssignments[owner.panel.edgeIds[edge]]={slotAssignments:[{connectionId:id,slotRole:'A'}]};
    sAssignments[mate.panel.edgeIds[(edge+2)%4]]={slotAssignments:[{connectionId:id,slotRole:'B'}]};
    sConnections[id]={id,prefix:'S',properties:{slotLengthMm:14.2+index,isSlotLengthManual:!!spec.manualS,slotOffsetMm:spec.slotOffset??0}};});
  const model:SvgDocumentModel={content:'',innerMarkup:'',rootAttributes:{width:null,height:null,viewBox:null},viewBox:'0 0 2400 1600',width:2400,height:1600,
    panels:rectangles.map(x=>x.panel),edges:rectangles.flatMap(x=>x===owner?owner.edges:x.edges)};
  const thickness={defaultThicknessMm:3.2,panels:Object.fromEntries(rectangles.map((r,i)=>[r.panel.id,{panelId:r.panel.id,thicknessMm:[5.4,3.2,4.1][i%3]}]))};
  const tb=buildGeneratedTBGeometryItems(model,tbAssignments,tbConnections,thickness);
  const s=buildGeneratedSGeometryItems(model,sAssignments,sConnections,thickness);
  return {spec,model,ownerPanelId:owner.panel.id,raw:[...tb,...s] as GeneratedGeometryItem[],tb,s};
};

export const canonical = (value: unknown) => JSON.stringify(value);
