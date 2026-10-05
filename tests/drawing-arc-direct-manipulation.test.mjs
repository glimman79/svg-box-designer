import test from 'node:test';
import assert from 'node:assert/strict';
import { createArcCenterDragTarget, createArcEndpointDragTarget, createArcRadiusDragTarget } from '../.test-build/drawing-arc-direct-manipulation/drawingDirectManipulation.js';
const document={schemaVersion:2,unit:'mm',activeSketchId:'s',sketchOrder:['s'],sketches:{s:{id:'s',name:'S',points:{o:{id:'o',x:0,y:0},a:{id:'a',x:5,y:0},b:{id:'b',x:0,y:5}},entities:{arc:{id:'arc',type:'arc',centerPointId:'o',radius:5,startPointId:'a',endPointId:'b',orientation:'CCW'}},entityOrder:['arc'],dimensions:{},dimensionOrder:[],geometricConstraints:{},geometricConstraintOrder:[]}}};
test('Stage 3 explicitly defers every Arc own-grip manipulation without a legacy fallback',()=>{
 assert.equal(createArcCenterDragTarget(document,'arc'),null);
 assert.equal(createArcEndpointDragTarget(document,'arc','a'),null);
 assert.equal(createArcRadiusDragTarget(document,'arc',{x:3.5,y:3.5}),null);
});
