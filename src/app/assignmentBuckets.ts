import type { EdgeAssignment, EdgeAssignmentBucket } from '../svgUtils';
import { hasConnectionLabelPrefix } from './connectionLabels';

export const isEdgeAssignmentBucket = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined): assignment is EdgeAssignmentBucket => (
  !!assignment && ('edgeAssignment' in assignment || 'slotAssignments' in assignment)
);

export const toEdgeAssignmentBucket = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined): EdgeAssignmentBucket | undefined => {
  if (!assignment) {
    return undefined;
  }

  if (isEdgeAssignmentBucket(assignment)) {
    return assignment;
  }

  if (hasConnectionLabelPrefix(assignment.connectionId, 'TB', 'W')) {
    return { edgeAssignment: assignment };
  }

  if (hasConnectionLabelPrefix(assignment.connectionId, 'S')) {
    return { slotAssignments: [assignment] };
  }

  return { edgeAssignment: assignment };
};

export const getBucketEdgeAssignment = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined) => (
  toEdgeAssignmentBucket(assignment)?.edgeAssignment
);

export const getBucketSlotAssignments = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined) => (
  toEdgeAssignmentBucket(assignment)?.slotAssignments ?? []
);
