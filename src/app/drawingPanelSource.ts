import { buildTopologyGraph, createSvgPanelsFromClosedContours, getPanelFigureBounds, getSignedArea, linesIntersect,
  type RawImportedContour, type SvgDocumentModel, type SvgEdge } from '../svgUtils';
import { coincidentPairs, type SketchOperation } from './constructionOperations';
import type { DrawingEntity, DrawingSketchV2 } from './drawingTypes';
import { resolveLine } from './drawingTopology';
import { createBoxDocumentV1 } from './boxDocument';
import { pointsToClosedPathD } from './sharedGeometry';

/** Import tolerance may reject an ambiguous contour, but may never weld two Drawing points. */
export function drawingPanelModel(sketch: DrawingSketchV2, operation: SketchOperation): SvgDocumentModel {
  const parent = new Map<string, string>();
  function representative(id: string): string {
    let root = id;
    while (parent.has(root)) root = parent.get(root)!;
    if (root !== id) parent.set(id, root);
    return root;
  }
  for (const [a, b] of coincidentPairs(sketch)) {
    const left = representative(a), right = representative(b);
    if (left !== right) parent.set(left, right);
  }

  const source = 'sketch-' + encodeURIComponent(operation.id);
  const endpoints = new Map<string, [string, string]>();
  const arcEnds = new Set<string>();
  const edges: SvgEdge[] = [];
  for (const entity of Object.values(sketch.entities) as DrawingEntity[]) {
    if (entity.type === 'arc') {
      arcEnds.add(representative(entity.startPointId));
      arcEnds.add(representative(entity.endPointId));
    }
    if (entity.type !== 'line') continue;
    const line = resolveLine(sketch, entity);
    if (!line || ![line.start.x, line.start.y, line.end.x, line.end.y].every(Number.isFinite)) continue;
    const id = line.id;
    endpoints.set(id, [representative(line.startPointId), representative(line.endPointId)]);
    edges.push({ id, source, drawingEntityId: line.id, start: line.start, end: line.end });
  }
  const graph = buildTopologyGraph(edges);
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const edgeById = new Map(edges.map(edge => [edge.id, edge]));
  const segments = new Map(graph.segments.map(segment => [segment.id, segment]));
  const contours: RawImportedContour[] = [];
  for (const chain of graph.chains) {
    if (chain.classification !== 'ClosedLoop' || chain.segmentIds.length < 3 || chain.endNodeId !== chain.startNodeId) continue;
    const ordered = chain.segmentIds.map(id => segments.get(id)!);
    const points = chain.nodeIds.slice(0, -1).map(id => nodes.get(id)!.point);
    const semanticClosure = ordered.every((edge, i) => {
      const next = ordered[(i + 1) % ordered.length];
      const endNode = chain.nodeIds[i + 1];
      const end = endNode === edge.endNodeId, start = endNode === next.startNodeId;
      const a = endpoints.get(edge.id)![end ? 1 : 0], b = endpoints.get(next.id)![start ? 0 : 1];
      const p = end ? edge.end : edge.start, q = start ? next.start : next.end;
      return a === b && !arcEnds.has(a) && Math.hypot(p.x - q.x, p.y - q.y) <= 1e-6;
    });
    if (!semanticClosure || ordered.length !== points.length || new Set(chain.nodeIds.slice(0, -1)).size !== ordered.length) continue;
    const bounds = getPanelFigureBounds(points);
    if (!bounds || Math.abs(getSignedArea(points)) <= 1e-6) continue;
    const members = new Set(chain.segmentIds);
    if (graph.segments.some(other => !members.has(other.id) && ordered.some(edge => linesIntersect(edge, other)))) continue;
    const contourId = source + '/panel/' + encodeURIComponent(JSON.stringify([...members].sort()));
    const edgeIds: string[] = [];
    for (const segment of ordered) {
      const edge = edgeById.get(segment.id)!;
      edge.panelBounds = bounds;
      edge.source = contourId;
      edge.id = contourId + '/edge/' + encodeURIComponent(segment.id);
      edgeIds.push(edge.id);
    }
    contours.push({ source: contourId, contour: points, edgeIds, bounds });
  }
  const panels = createSvgPanelsFromClosedContours({ contours, looseEdges: [] });
  const contourByEdge = new Map(edges.map(edge => [edge.id, edge.source]));
  const stableIds = new Map(panels.map(panel => [panel.id, contourByEdge.get(panel.edgeIds[0])!]));
  for (const panel of panels) {
    panel.id = stableIds.get(panel.id)!;
    if (panel.parentPanelId) panel.parentPanelId = stableIds.get(panel.parentPanelId);
  }
  const model = createBoxDocumentV1();
  const eligible = new Set(panels.flatMap(panel => [...panel.outerEdgeIds, ...panel.innerEdgeIds.flat()]));
  const innerMarkup = contours.map(c => '<path d="' + pointsToClosedPathD(c.contour) + '" fill="none" stroke="black"/>').join('');
  const bounds = getPanelFigureBounds(contours.flatMap(c => c.contour));
  const width = bounds ? bounds.maxX - bounds.minX : model.width;
  const height = bounds ? bounds.maxY - bounds.minY : model.height;
  const viewBox = bounds ? [bounds.minX, bounds.minY, width, height].join(' ') : model.viewBox;
  return { ...model, panels, edges: edges.filter(edge => eligible.has(edge.id)), innerMarkup, width, height, viewBox,
    rootAttributes: { width: width + 'mm', height: height + 'mm', viewBox },
    content: '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + 'mm" height="' + height + 'mm" viewBox="' + viewBox + '">' + innerMarkup + '</svg>',
    drawingSource: { operationId: operation.id, sketchId: sketch.id, geometryRevision: operation.geometryRevision ?? operation.definitionRevision,
      excludedMembers: sketch.entityOrder.length - eligible.size } };
}
