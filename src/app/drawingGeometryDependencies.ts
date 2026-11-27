import { AppliedGeometryCompositionError, evaluateAppliedGeometry } from './appliedGeometry';
import { assignedConnectionIds, toEdgeAssignmentBucket } from './assignmentBuckets';
import { collectSourceEdgeAuthoringClaims, validateAuthorityModeForAuthoringClaims,
  validateSourceEdgeReplacementClaims } from './authoringRelationships';
import { connectionGroups } from './connectionGroups';
import type { PanelCompositionAuthorityMode } from './generatedGeometryAuthority';
import { createGeneratedGeometrySnapshot, retainEquivalentSnapshot } from './generatedGeometrySnapshot';
import { GeometryDependencyError } from './geometryDependencyError';
import type { BoxStateSource } from './projectState';
import { TBGeometryError, validateCurrentTBEdgeCompatibility } from './tbGeometry';
import { getWallAssignments, validateWallAuthoringForApply, wallRequiredRole } from './wallAuthoring';

type DependencyDiagnostic = NonNullable<BoxStateSource['dependencyDiagnostics']>[number];

function selectContributions(box: BoxStateSource, blocked: ReadonlyMap<string, DependencyDiagnostic>): BoxStateSource {
  if (!blocked.size) return box;
  const connections = Object.fromEntries(Object.entries(box.connections).filter(([id]) => !blocked.has(id)));
  const edgeAssignments: BoxStateSource['edgeAssignments'] = {};
  for (const [id, value] of Object.entries(box.edgeAssignments)) {
    if (!assignedConnectionIds(value).some(connectionId => blocked.has(connectionId))) {
      edgeAssignments[id] = value;
      continue;
    }
    const bucket = toEdgeAssignmentBucket(value)!;
    const edgeAssignment = bucket.edgeAssignment && !blocked.has(bucket.edgeAssignment.connectionId) ? bucket.edgeAssignment : undefined;
    const slotAssignments = bucket.slotAssignments?.filter(slot => !blocked.has(slot.connectionId));
    if (edgeAssignment || slotAssignments?.length) edgeAssignments[id] = { edgeAssignment, slotAssignments };
  }
  return { ...box, connections, edgeAssignments };
}

/** Evaluate approved authoring against the new Sketch in complete, current panel batches. */
export function evaluateDrawingGeometry(box: BoxStateSource, sourceId: string, mode: PanelCompositionAuthorityMode) {
  const { svgModel, edgeAssignments, connections, activeWallGroup, generatedGeometrySnapshot } = box;
  const claims = collectSourceEdgeAuthoringClaims(svgModel, edgeAssignments, connections);
  const panelByEdge = new Map(svgModel.panels.flatMap(panel => panel.edgeIds.map(edgeId => [edgeId, panel.id] as const)));
  const edgesByConnection = new Map<string, string[]>();
  for (const [edgeId, bucket] of Object.entries(edgeAssignments)) {
    for (const id of new Set(assignedConnectionIds(bucket))) {
      const edges = edgesByConnection.get(id) ?? [];
      edges.push(edgeId);
      edgesByConnection.set(id, edges);
    }
  }
  const groups = (['TB', 'W', 'S'] as const).flatMap(tool => connectionGroups(box, tool));
  const blocked = new Map<string, DependencyDiagnostic>();
  const report = (error: GeometryDependencyError) => {
    for (const connectionId of error.connectionIds) {
      if (blocked.has(connectionId)) continue;
      const group = groups.find(group => group.connectionIds.includes(connectionId));
      const edgeIds = edgesByConnection.get(connectionId) ?? [];
      const panelIds = [...new Set(edgeIds.flatMap(id => panelByEdge.get(id) ?? []))];
      blocked.set(connectionId, { code: error instanceof TBGeometryError ? error.code : 'BOX_REGENERATION_FAILED',
        severity: 'error', sourceId, ...(group && { groupId: group.groupId }), connectionId, panelIds, edgeIds, message: error.message });
    }
  };

  try {
    validateCurrentTBEdgeCompatibility(svgModel, edgeAssignments, connections, report);
    validateSourceEdgeReplacementClaims(claims, report);
    validateAuthorityModeForAuthoringClaims(claims, mode, report);
    validateWallAuthoringForApply(svgModel, edgeAssignments, connections, activeWallGroup, report);
    for (const [id, edgeIds] of edgesByConnection) {
      if (!Object.hasOwn(connections, id) || edgeIds.some(edgeId => !panelByEdge.has(edgeId))) {
        report(new GeometryDependencyError([id], `${id} has a missing construction definition or source edge.`));
      }
    }

    while (true) {
      const selected = selectContributions(box, blocked);
      const count = blocked.size;
      for (const wall of Object.values(selected.connections).filter(connection => connection.prefix === 'W')) {
        const [first, second] = getWallAssignments(svgModel, edgeAssignments, wall.id);
        if (!first || !second) continue; // A trailing draft contributes no geometry.
        const fullRole = wallRequiredRole(svgModel, edgeAssignments, connections, first.panelId, second.panelId);
        const currentRole = wallRequiredRole(svgModel, selected.edgeAssignments, selected.connections, first.panelId, second.panelId);
        if (fullRole !== currentRole) {
          const blockedTB = [...new Set(claims.filter(claim => claim.contributorId === 'TB' && blocked.has(claim.connectionId)
            && (claim.panelId === first.panelId || claim.panelId === second.panelId)).map(claim => claim.connectionId))];
          const verb = blockedTB.length === 1 ? 'is' : 'are';
          report(new GeometryDependencyError([wall.id], `${wall.id} cannot retain its authored Wall roles while ${blockedTB.join(', ')} ${verb} blocked.`));
        }
      }
      if (blocked.size !== count) continue;

      try {
        const { snapshot } = evaluateAppliedGeometry(selected, mode);
        return { snapshot, diagnostics: [...blocked.values()] };
      } catch (error) {
        if (error instanceof GeometryDependencyError) report(error);
        else if (error instanceof AppliedGeometryCompositionError) {
          // The downstream gate is project-wide. Resolve localized failures before treating it as a blocker.
          for (const decision of error.selection.blockingDecisions) {
            if (decision.reason === 'DOWNSTREAM_DIAGNOSTIC_FAILURE') continue;
            const affected = [...new Set(claims.filter(claim => claim.panelId === decision.panelId
              && !blocked.has(claim.connectionId)).map(claim => claim.connectionId))];
            report(new GeometryDependencyError(affected, `Cannot compose panel ${decision.panelId}: ${decision.reason}.`));
          }
        }
        if (blocked.size === count) throw error;
      }
    }
  } catch (error) {
    const message = `BOX construction could not regenerate: ${error instanceof Error ? error.message : String(error)}`;
    report(new GeometryDependencyError([...edgesByConnection.keys()], message));
    const diagnostics = [...blocked.values()];
    if (!diagnostics.length) diagnostics.push({ code: 'BOX_REGENERATION_FAILED', severity: 'error',
      sourceId, panelIds: [], edgeIds: [], message });
    const snapshot = retainEquivalentSnapshot(generatedGeometrySnapshot, createGeneratedGeometrySnapshot({ generatedGeometry: [] }));
    return { snapshot, diagnostics };
  }
}
