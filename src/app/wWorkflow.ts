import type { EdgeAssignmentRecord, EdgeRole, SlotRole, SvgDocumentModel } from '../svgUtils';
import { getBucketSlotAssignments, toEdgeAssignmentBucket } from './assignmentBuckets';
import type { ActiveWGroup, ConnectionMap, WallPatternType, WallReference } from './connectionTypes';
import { findPanelContainingEdge } from './panelLookup';

const collectEdgeReferenceLabels = (edgeId: string, assignments: EdgeAssignmentRecord): WallReference[] => {
  const bucket = toEdgeAssignmentBucket(assignments[edgeId]);
  if (!bucket) {
    return [];
  }

  const edgeReference = bucket.edgeAssignment?.connectionId.startsWith('E') && bucket.edgeAssignment.edgeRole
    ? [{ edgeId, connectionId: bucket.edgeAssignment.connectionId, role: bucket.edgeAssignment.edgeRole, sourceType: 'E' as const }]
    : [];
  const slotReferences = getBucketSlotAssignments(bucket)
    .filter((assignment) => assignment.connectionId.startsWith('S') && !!assignment.slotRole)
    .map((assignment) => ({ edgeId, connectionId: assignment.connectionId, role: assignment.slotRole as SlotRole, sourceType: 'S' as const }));

  return [...edgeReference, ...slotReferences];
};

export const collectWReferences = (
  selectedEdgeIds: string[],
  assignments: EdgeAssignmentRecord,
  svgModel: SvgDocumentModel,
  wallConnectionId = 'W group',
): WallReference[] => {
  const selectedPanelIds = new Set<string>();

  return selectedEdgeIds.reduce<WallReference[]>((panelReferences, selectedEdgeId) => {
    const panel = findPanelContainingEdge(svgModel, selectedEdgeId);
    if (!panel) {
      throw new Error(`${wallConnectionId} selected wall edge ${selectedEdgeId} is not part of a valid panel.`);
    }

    if (selectedPanelIds.has(panel.id)) {
      return panelReferences;
    }
    selectedPanelIds.add(panel.id);

    const references = panel.edgeIds.flatMap((panelEdgeId) => collectEdgeReferenceLabels(panelEdgeId, assignments));

    if (references.length === 0) {
      throw new Error(`${wallConnectionId} selected panel ${panel.id} has 0 E/S reference labels.`);
    }

    if (references.length > 1) {
      throw new Error(`${wallConnectionId} selected panel ${panel.id} has multiple E/S reference labels.`);
    }

    panelReferences.push(references[0]);
    return panelReferences;
  }, []);
};

export const buildActiveWDisplayAssignments = (
  assignments: EdgeAssignmentRecord,
  connections: ConnectionMap,
  activeWGroup: ActiveWGroup | null,
): EdgeAssignmentRecord => {
  if (!activeWGroup?.isActive) {
    return assignments;
  }

  const wConnection = connections[activeWGroup.connectionId];
  if (!wConnection || wConnection.prefix !== 'W') {
    return assignments;
  }

  const displayAssignments: EdgeAssignmentRecord = { ...assignments };
  wConnection.properties.selectedEdgeIds.forEach((edgeId) => {
    const currentBucket = toEdgeAssignmentBucket(displayAssignments[edgeId]) ?? {};
    if (currentBucket.edgeAssignment) {
      return;
    }

    displayAssignments[edgeId] = {
      ...currentBucket,
      edgeAssignment: { connectionId: wConnection.id },
    };
  });

  return displayAssignments;
};

export const classifyWReferencePattern = (references: WallReference[]): WallPatternType | null => {
  if (references.length === 0) {
    return null;
  }

  const roles = references.map((reference) => reference.role);
  const allSame = roles.every((role) => role === roles[0]);
  if (allSame) {
    return 'UNIFORM';
  }

  const alternating = roles.length > 1 && roles.every((role, index) => index === 0 || role !== roles[index - 1]);
  return alternating ? 'ALTERNATING' : null;
};

export const invertWPatternType = (patternType: WallPatternType): WallPatternType => (
  patternType === 'UNIFORM' ? 'ALTERNATING' : 'UNIFORM'
);

export const generateWEdgeRoles = (edgeIds: string[], generatedPatternType: WallPatternType): EdgeRole[] => (
  edgeIds.map((_, index) => (generatedPatternType === 'ALTERNATING' && index % 2 === 1 ? 'B' : 'A'))
);

const shouldCopyMixedEReferenceRoles = (references: WallReference[], referencePatternType: WallPatternType): boolean => (
  referencePatternType === 'ALTERNATING'
  && references.every((reference) => reference.sourceType === 'E' && (reference.role === 'A' || reference.role === 'B'))
);

const buildPanelReferenceRoleMap = (references: WallReference[], svgModel: SvgDocumentModel, wallConnectionId: string) => (
  references.reduce<Map<string, EdgeRole>>((roleByPanelId, reference) => {
    const panel = findPanelContainingEdge(svgModel, reference.edgeId);
    if (!panel) {
      throw new Error(`${wallConnectionId} reference edge ${reference.edgeId} is not part of a valid panel.`);
    }

    roleByPanelId.set(panel.id, reference.role as EdgeRole);
    return roleByPanelId;
  }, new Map<string, EdgeRole>())
);

const copyMixedEReferenceRolesToWEdges = (
  selectedEdgeIds: string[],
  references: WallReference[],
  svgModel: SvgDocumentModel,
  wallConnectionId: string,
): EdgeRole[] => {
  const referenceRoleByPanelId = buildPanelReferenceRoleMap(references, svgModel, wallConnectionId);

  return selectedEdgeIds.map((selectedEdgeId) => {
    const selectedPanel = findPanelContainingEdge(svgModel, selectedEdgeId);
    if (!selectedPanel) {
      throw new Error(`${wallConnectionId} selected wall edge ${selectedEdgeId} is not part of a valid panel.`);
    }

    const referenceRole = referenceRoleByPanelId.get(selectedPanel.id);
    if (!referenceRole) {
      throw new Error(`${wallConnectionId} selected panel ${selectedPanel.id} has no matching E reference role.`);
    }

    return referenceRole;
  });
};

export const finishWGroupWorkflow = (
  connections: ConnectionMap,
  assignments: EdgeAssignmentRecord,
  activeWGroup: ActiveWGroup | null,
  svgModel: SvgDocumentModel,
): { connections: ConnectionMap; assignments: EdgeAssignmentRecord; selectedLabelId: string | null; activeWGroup: ActiveWGroup | null } => {
  if (!activeWGroup?.isActive) {
    return { connections, assignments, selectedLabelId: null, activeWGroup };
  }

  const wConnection = connections[activeWGroup.connectionId];
  if (!wConnection || wConnection.prefix !== 'W') {
    throw new Error('Active W group is missing its W connection metadata.');
  }

  const selectedEdgeIds = wConnection.properties.selectedEdgeIds;
  if (selectedEdgeIds.length === 0) {
    throw new Error(`${activeWGroup.connectionId} has no selected wall edges.`);
  }

  const references = collectWReferences(selectedEdgeIds, assignments, svgModel, activeWGroup.connectionId);

  const referencePatternType = classifyWReferencePattern(references);
  if (!referencePatternType) {
    throw new Error(`${activeWGroup.connectionId} references are neither uniform nor alternating across the complete W group.`);
  }

  const copyMixedERoles = shouldCopyMixedEReferenceRoles(references, referencePatternType);
  const generatedPatternType = copyMixedERoles ? referencePatternType : invertWPatternType(referencePatternType);
  const generatedRoles = copyMixedERoles
    ? copyMixedEReferenceRolesToWEdges(selectedEdgeIds, references, svgModel, activeWGroup.connectionId)
    : generateWEdgeRoles(selectedEdgeIds, generatedPatternType);

  const nextAssignments = { ...assignments };
  selectedEdgeIds.forEach((edgeId, index) => {
    const currentBucket = toEdgeAssignmentBucket(nextAssignments[edgeId]) ?? {};
    nextAssignments[edgeId] = {
      ...currentBucket,
      edgeAssignment: {
        connectionId: wConnection.id,
        edgeRole: generatedRoles[index],
      },
    };
  });

  return {
    connections: {
      ...connections,
      [wConnection.id]: {
        ...wConnection,
        properties: {
          ...wConnection.properties,
          references,
          referencePatternType,
          generatedPatternType,
          generatedConnectionIds: [],
        },
      },
    },
    assignments: nextAssignments,
    selectedLabelId: wConnection.id,
    activeWGroup: { ...activeWGroup, isActive: false },
  };
};

