import { DRAWING_MODEL_SPACE_TOLERANCE, type DrawingPoint } from './drawingTypes.js';

export type DirectionDemandSource = 'parallel' | 'perpendicular' | 'point-reference' | 'angular';

export type NormalizedDirectionDemand = Readonly<{
  id: string;
  direction: DrawingPoint;
  source: DirectionDemandSource;
  semanticRelation: 'parallel' | 'perpendicular' | null;
  referenceIdentity: string | null;
  screenDistance: number;
}>;

export type EquivalentDirectionDemandGroup = Readonly<{
  id: string;
  direction: DrawingPoint;
  demands: readonly NormalizedDirectionDemand[];
}>;

export const normalizeUnorientedDirection = (direction: DrawingPoint): DrawingPoint | null => {
  const length = Math.hypot(direction.x, direction.y);
  if (length <= DRAWING_MODEL_SPACE_TOLERANCE) return null;
  let x = direction.x / length, y = direction.y / length;
  if (x < -DRAWING_MODEL_SPACE_TOLERANCE || (Math.abs(x) <= DRAWING_MODEL_SPACE_TOLERANCE && y < 0)) {
    x = -x; y = -y;
  }
  return { x, y };
};

export const equivalentUnorientedDirections = (a: DrawingPoint, b: DrawingPoint) =>
  Math.abs(a.x * b.y - a.y * b.x) <= DRAWING_MODEL_SPACE_TOLERANCE;

/** Groups geometry without merging the semantic detections that supplied it. */
export const groupEquivalentDirectionDemands = (demands: readonly NormalizedDirectionDemand[]): readonly EquivalentDirectionDemandGroup[] => {
  const groups: Array<{ id: string; direction: DrawingPoint; demands: NormalizedDirectionDemand[] }> = [];
  for (const demand of demands) {
    const group = groups.find(({ direction }) => equivalentUnorientedDirections(direction, demand.direction));
    if (group) group.demands.push(demand);
    else groups.push({ id: `direction-${groups.length + 1}`, direction: demand.direction, demands: [demand] });
  }
  return groups;
};

const REPRESENTATION_PREFERENCE: Readonly<Record<DirectionDemandSource, number>> = {
  parallel: 40,
  perpendicular: 30,
  'point-reference': 20,
  angular: 10,
};

/** Selects one deterministic representative per equivalent demand group for
 * transaction-scoped persistence minimization. Live presentation must instead
 * retain every accepted semantic relation. */
export const selectPreferredDirectionDemandRepresentatives = (groups: readonly EquivalentDirectionDemandGroup[]) =>
  groups.map((group) => group.demands.slice().sort((a, b) =>
    REPRESENTATION_PREFERENCE[b.source] - REPRESENTATION_PREFERENCE[a.source]
      || a.screenDistance - b.screenDistance || a.id.localeCompare(b.id))[0]);
