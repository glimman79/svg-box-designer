import type { EdgeAssignment, EdgeAssignmentBucket } from '../svgUtils';

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

  if (assignment.connectionId.startsWith('E')) {
    return { edgeAssignment: assignment };
  }

  if (assignment.connectionId.startsWith('S')) {
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
