import type { DrawingCoincidentConstraint, DrawingGeometryReference, DrawingPointReference } from '../../src/app/drawingTypes.js';
import type { AcceptedArcEndpoint } from '../../src/app/drawingArcTool.js';
import type { LineSegmentInteractionState } from '../../src/app/drawingLineSegmentSupport.js';
// @ts-expect-error The obsolete Arc-center reference is no longer exported.
import type { DrawingDerivedPointReference } from '../../src/app/drawingTypes.js';
// @ts-expect-error The obsolete Coincidence contract is no longer exported.
import type { DrawingPointToDerivedPointCoincidentConstraint } from '../../src/app/drawingTypes.js';
// @ts-expect-error Bulge Arc documents have no supported exported contract.
import type { LegacyDrawingArcEntity } from '../../src/app/drawingTypes.js';
// @ts-expect-error There is no obsolete Arc-center Coincidence factory.
import { createPointToDerivedPointCoincidentConstraint } from '../../src/app/drawingCoincidentConstraint.js';

const center: DrawingPointReference = { kind: 'sketchPoint', pointId: 'center' };
const geometry: DrawingGeometryReference = center;
const coincident: DrawingCoincidentConstraint = { id: 'join', kind: 'COINCIDENT', variant: 'point-point',
  references: [center, { kind: 'sketchPoint', pointId: 'other' }] };
// @ts-expect-error Arc centers use persistent SketchPoint identity.
const obsoletePoint: DrawingPointReference = { kind: 'derivedPoint', entityId: 'arc', role: 'center' };
// @ts-expect-error Geometry references cannot carry obsolete Arc-center identity.
const obsoleteGeometry: DrawingGeometryReference = { kind: 'derivedPoint', entityId: 'arc', role: 'center' };
// @ts-expect-error Coincidence only supports current point, support, and curve variants.
const obsoleteVariant: DrawingCoincidentConstraint['variant'] = 'point-derived-point';
// @ts-expect-error Arc endpoint authoring has no derived-center fallback.
const obsoleteEndpointKey: keyof AcceptedArcEndpoint = 'derivedPointReference';
// @ts-expect-error Line/Profile authoring has no derived-center fallback.
const obsoleteSegmentKey: keyof LineSegmentInteractionState = 'startDerivedPointReference';
void [geometry, coincident, obsoletePoint, obsoleteGeometry, obsoleteVariant, obsoleteEndpointKey, obsoleteSegmentKey];
