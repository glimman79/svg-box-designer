import type { EdgeAssignmentBucket, EdgeRole, SlotRole } from '../svgUtils';
import { getBucketEdgeAssignment, getBucketSlotAssignments, toEdgeAssignmentBucket } from './assignmentBuckets';
import { isSourceApproved, sameSketchRequired } from './boxSources';
import { collectSourceEdgeAuthoringClaims, deriveCanvasEdgeRelationshipState, sourceEdgeRelationshipKey } from './canvasEdgeRelationships';
import { parseConnectionLabel } from './connectionLabels';
import { propertiesChanged, type ConnectionPropertiesByPrefix } from './connectionTypes';
import type { BoxStateSource } from './projectState';
import { applyFingerWidthUpdate } from './tabSizeControl';
import { applyActiveSGroupSlotPropertyUpdates, applySlotPropertyUpdates, getDefaultSlotRole, maybeAutoCreateNextSInGroup } from './sWorkflow';
import { appendAutoCreatedTBToTBGroup, createTBConnectionDefinition, getSharedTBEdgeProperties } from './tbWorkflow';
import { getWallAssignments, validateWallConnection } from './wallAuthoring';
import { authorWallEdge } from './wallWorkflow';

export const defaultConnectionProperties: ConnectionPropertiesByPrefix = {
  TB: {
    fingerWidthMm: 9,
    isFingerWidthManual: false,
  },
  W: { fingerWidthMm: 9, isFingerWidthManual: false },
  S: {
    slotOffsetMm: 0,
    slotLengthMm: 9,
    isSlotLengthManual: false,
    kerfMm: 0.15,
  },
  C: {
    cornerDepthMm: 9,
    isCornerDepthManual: false,
    materialThicknessMm: 3,
    kerfMm: 0.15,
    playMm: 0,
    cornerType: 'finger',
  },
  P: {
    patternType: 'line-fill',
    patternWidthMm: 20,
    materialThicknessMm: 3,
    lineSpacingMm: 5,
    rowOffsetMm: 0,
    marginMm: 2,
  },
};

function requireSourceEdge(box: BoxStateSource, edgeId: string) {
  if (!box.svgModel.edges.some(edge => edge.id === edgeId)) throw new Error('Select a current source edge.');
}

function requireReplacementAvailable(box: BoxStateSource, edgeId: string, connectionId: string) {
  const panel = box.svgModel.panels.find(panel => panel.edgeIds.includes(edgeId));
  if (!panel) return;
  const claims = collectSourceEdgeAuthoringClaims(box.svgModel, box.edgeAssignments, box.connections);
  const relationships = deriveCanvasEdgeRelationshipState(claims);
  const source = relationships.bySource.get(sourceEdgeRelationshipKey(panel.id, edgeId));
  const operationId = `operation:${box.connections[connectionId].prefix}:${connectionId}`;
  if (source?.replacementClaimants.some(owner => owner !== operationId)) {
    throw new Error('This edge already has a replacement assignment.');
  }
}

export function assignConstructionEdge(box: BoxStateSource, edgeId: string, id: string): BoxStateSource {
  if (box.svgModel.drawingSource || edgeId.startsWith('sketch-')) {
    if (!box.svgModel.edges.some(e => e.id === edgeId)) throw new Error(sameSketchRequired);
    if (box.svgModel.drawingSource && !box.svgModel.panels.some(p => p.outerEdgeIds.includes(edgeId)))
      throw new Error('Select an outer panel edge for construction.');
    if (!isSourceApproved(box)) throw new Error('Review this Sketch in Panel Manager before assigning edges.');
  }
  requireSourceEdge(box, edgeId);
  const { edgeAssignments, connections, activeWallGroup, activeSGroup } = box;
  const connection = connections[id];
  if (!connection || id !== box.assignmentTargetConnectionId) throw new Error('Select a valid connection before clicking an edge.');
  const bucket = toEdgeAssignmentBucket(edgeAssignments[edgeId]) ?? {};
  const context = { displayConnectionId: id, selectedEdgeId: edgeId };

  if (connection.prefix === 'W') {
    if (!box.svgModel.panels.some(panel => panel.edgeIds.includes(edgeId))) {
      throw new Error('Select a Wall source edge on a current panel.');
    }
    if (getWallAssignments(box.svgModel, edgeAssignments, id).length >= 2) {
      throw new Error(`${id} is complete. Create another Wall connection before assigning another edge.`);
    }
    requireReplacementAvailable(box, edgeId, id);
    if (!activeWallGroup?.isActive || !activeWallGroup.connectionIds.includes(id)) {
      throw new Error('Start an active Wall session before assigning edges.');
    }
    const next = authorWallEdge(box.svgModel, edgeAssignments, connections, activeWallGroup, id, edgeId);
    if (next.selectedLabelId !== id) validateWallConnection(box.svgModel, next.assignments, next.connections, id);
    return { ...box, ...context, connections: next.connections, activeWallGroup: next.activeWallGroup,
      edgeAssignments: next.assignments as BoxStateSource['edgeAssignments'], assignmentTargetConnectionId: next.selectedLabelId };
  }

  if (connection.prefix === 'TB') {
    requireReplacementAvailable(box, edgeId, id);
    if (bucket.edgeAssignment) throw new Error('This edge already has a TB assignment.');
    const prior = Object.values(edgeAssignments).map(getBucketEdgeAssignment).filter(assignment => assignment?.connectionId === id);
    const role: EdgeRole = prior.some(a => a?.edgeRole === 'A') && !prior.some(a => a?.edgeRole === 'B') ? 'B' : 'A';
    const next = { ...box, ...context, edgeAssignments: { ...edgeAssignments, [edgeId]: {
      ...bucket, edgeAssignment: { connectionId: id, edgeRole: role },
    } } };
    const parsed = parseConnectionLabel(id);
    if (prior.length !== 1 || parsed?.prefix !== 'TB') return next;
    const nextId = `TB${parsed.number + 1}`;
    return { ...next, assignmentTargetConnectionId: nextId,
      connections: connections[nextId] ? connections : { ...connections,
        [nextId]: createTBConnectionDefinition(nextId, getSharedTBEdgeProperties(connections, defaultConnectionProperties.TB)) },
      activeTBGroup: appendAutoCreatedTBToTBGroup(box.activeTBGroup, id, nextId) };
  }

  if (connection.prefix !== 'S') throw new Error('Select a TB, W or S connection before assigning edges.');
  const role = getDefaultSlotRole(edgeAssignments, id);
  if (bucket.slotAssignments?.some(assignment => assignment.connectionId === id)) {
    throw new Error('This edge already has this S assignment.');
  }
  if (!role && !(activeSGroup?.isActive && activeSGroup.connectionIds.includes(id))) {
    throw new Error(`${id} is complete. Start S Group or select another S connection before assigning another edge.`);
  }
  if (role === 'A') requireReplacementAvailable(box, edgeId, id);
  const assignments = role ? { ...edgeAssignments, [edgeId]: { ...bucket,
    slotAssignments: [...(bucket.slotAssignments ?? []), { connectionId: id, slotRole: role }] } } : edgeAssignments;
  const next = maybeAutoCreateNextSInGroup(connections, assignments, activeSGroup, id);
  if (assignments === edgeAssignments && next.connections === connections) return box;
  return { ...box, ...context, edgeAssignments: assignments, assignmentTargetConnectionId: next.selectedLabelId,
    connections: next.connections, activeSGroup: next.activeSGroup };
}

export function changeConstructionRole(box: BoxStateSource, edgeId: string, id: string, role: EdgeRole | SlotRole): BoxStateSource {
  requireSourceEdge(box, edgeId);
  const bucket = toEdgeAssignmentBucket(box.edgeAssignments[edgeId]);
  const connection = box.connections[id];
  if (!bucket || !connection || id !== box.displayConnectionId) throw new Error('Select a current assigned connection.');
  if (role !== 'A' && role !== 'B') throw new Error('Select role A or B.');
  let next: EdgeAssignmentBucket;
  if (connection.prefix === 'S') {
    const slots = getBucketSlotAssignments(bucket);
    const assignment = slots.find(slot => slot.connectionId === id);
    if (!assignment) throw new Error('Select a current slot assignment.');
    if (assignment.slotRole === role) return box;
    if (role === 'A') requireReplacementAvailable(box, edgeId, id);
    next = { ...bucket, slotAssignments: slots.map(slot => slot === assignment ? { ...slot, slotRole: role } : slot) };
  } else {
    const assignment = bucket.edgeAssignment;
    if (!assignment || assignment.connectionId !== id || (connection.prefix !== 'TB' && connection.prefix !== 'W')) {
      throw new Error('Select a current edge assignment.');
    }
    if (assignment.edgeRole === role) return box;
    if (connection.prefix === 'W' && getWallAssignments(box.svgModel, box.edgeAssignments, id)
      .some(mate => mate.sourceEdgeId !== edgeId && mate.role === role)) {
      throw new Error('Wall requires complementary W-A and W-B roles.');
    }
    next = { ...bucket, edgeAssignment: { ...assignment, edgeRole: role } };
  }
  return { ...box, edgeAssignments: { ...box.edgeAssignments, [edgeId]: next } };
}

export function removeConstructionAssignment(box: BoxStateSource, edgeId: string, id?: string): BoxStateSource {
  requireSourceEdge(box, edgeId);
  if (id && (!box.connections[id] || box.displayConnectionId !== id)) throw new Error('Select a current assigned connection.');
  const bucket = toEdgeAssignmentBucket(box.edgeAssignments[edgeId]);
  const slots = getBucketSlotAssignments(bucket);
  if (!bucket || (!bucket.edgeAssignment?.connectionId && slots.length === 0)) return box;
  if (id && bucket.edgeAssignment?.connectionId !== id && !slots.some(slot => slot.connectionId === id)) return box;
  const edgeAssignments = { ...box.edgeAssignments };
  delete edgeAssignments[edgeId];
  if (id) {
    const edgeAssignment = bucket.edgeAssignment?.connectionId !== id ? bucket.edgeAssignment : undefined;
    const slotAssignments = slots.some(slot => slot.connectionId === id) ? slots.filter(slot => slot.connectionId !== id) : slots;
    if (edgeAssignment || slotAssignments.length) edgeAssignments[edgeId] = {
      ...(edgeAssignment && { edgeAssignment }), ...(slotAssignments.length && { slotAssignments }),
    };
  }
  return { ...box, edgeAssignments };
}

export type ConstructionPropertyEdit = { [P in keyof ConnectionPropertiesByPrefix]: {
  prefix: P; updates: Partial<ConnectionPropertiesByPrefix[P]>;
} }[keyof ConnectionPropertiesByPrefix];

export function editConstructionProperties(box: BoxStateSource, id: string | null, edit: ConstructionPropertyEdit): BoxStateSource {
  const selected = id && box.connections[id];
  if (!selected || selected.prefix !== edit.prefix || id !== box.displayConnectionId) {
    throw new Error('Select a current connection before editing its properties.');
  }
  const schema: Readonly<Record<string, string | number | boolean>> = defaultConnectionProperties[edit.prefix];
  for (const [key, value] of Object.entries(edit.updates)) {
    if (!Object.hasOwn(schema, key) || typeof value !== typeof schema[key]
      || (typeof value === 'number' && !Number.isFinite(value))
      || ((key === 'fingerWidthMm' || key === 'slotLengthMm') && Number(value) < 0)) {
      throw new Error(`Invalid ${key} value.`);
    }
  }

  let connections = box.connections;
  if ((edit.prefix === 'TB' || edit.prefix === 'W') && (selected.prefix === 'TB' || selected.prefix === 'W')) {
    connections = applyFingerWidthUpdate(connections, selected.id, edit.updates);
  } else if (edit.prefix === 'S' && selected.prefix === 'S') {
    if (box.activeSGroup?.isActive && box.activeSGroup.connectionIds.includes(selected.id)) {
      connections = applyActiveSGroupSlotPropertyUpdates(connections, box.activeSGroup, edit.updates);
    } else {
      const next = applySlotPropertyUpdates(selected, edit.updates);
      if (next !== selected) connections = { ...connections, [selected.id]: next };
    }
  } else if (edit.prefix === 'C' && selected.prefix === 'C') {
    const properties = { ...selected.properties, ...edit.updates };
    if (edit.updates.materialThicknessMm !== undefined && !selected.properties.isCornerDepthManual) {
      properties.cornerDepthMm = edit.updates.materialThicknessMm * 3;
    }
    if (edit.updates.cornerDepthMm !== undefined) properties.isCornerDepthManual = true;
    if (propertiesChanged(selected.properties, properties)) connections = { ...connections, [selected.id]: { ...selected, properties } };
  } else if (edit.prefix === 'P' && selected.prefix === 'P') {
    if (propertiesChanged(selected.properties, edit.updates)) connections = { ...connections,
      [selected.id]: { ...selected, properties: { ...selected.properties, ...edit.updates } } };
  }
  return connections === box.connections ? box : { ...box, connections };
}
