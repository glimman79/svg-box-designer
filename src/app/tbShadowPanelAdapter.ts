/**
 * Read-only adapter from TB's edge-local diagnostic profiles to the neutral
 * replacement contract consumed by the shadow panel composer.
 */
import type { GeneratedProfile } from './generatedProfiles';
import type { ShadowReplacedEdgeContribution } from './shadowPanelComposer';
import { cornerTouchTolerance } from './sharedGeometry';
import type { Point } from '../svgUtils';

const clonePoint = (point: Point): Point => ({ x: point.x, y: point.y });
const samePoint = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= cornerTouchTolerance;

/**
 * TB's role-effective attachment points lie on the role-effective edge
 * support.  Consequently the directed line between them is the complete
 * neutral support needed at both junctions; roles do not cross this boundary.
 */
export const adaptTBProfilesToShadowContributions = (
  profiles: ReadonlyArray<GeneratedProfile>,
): ReadonlyArray<ShadowReplacedEdgeContribution> => profiles.map((profile) => {
  if (profile.generatorType !== 'TB') {
    throw new Error(`Profile ${profile.id} is not a TB profile.`);
  }
  const elements = new Map(profile.orderedElements.map((element) => [element.id, element]));
  const support = { start: clonePoint(profile.attachmentStart), end: clonePoint(profile.attachmentEnd) };
  const projections = profile.geometryProjections.filter((projection, index, all) => !all.slice(0, index).some((prior) => (
    samePoint(prior.start, projection.start) && samePoint(prior.end, projection.end)
  )));
  // Role-effective terminal construction can retain an out-and-back semantic
  // pair which has no physical contour extent. Collapse only terminal inverse
  // pairs; interior tap walls retain their identity and geometry.
  while (projections.length >= 2 && samePoint(projections[0].start, projections[1].end)
    && samePoint(projections[0].end, projections[1].start)) projections.splice(0, 2);
  while (projections.length >= 2 && samePoint(projections.at(-2)!.start, projections.at(-1)!.end)
    && samePoint(projections.at(-2)!.end, projections.at(-1)!.start)) projections.splice(-2, 2);
  return {
    kind: 'replaced',
    panelId: profile.panelId,
    sourceEdgeId: profile.sourceEdgeId,
    operationId: profile.operationId,
    profileId: profile.id,
    sourceTraversal: {
      start: clonePoint(profile.sourceEdgeDirection.start),
      end: clonePoint(profile.sourceEdgeDirection.end),
    },
    startSupport: support,
    endSupport: support,
    geometry: projections.map((projection) => {
      const element = elements.get(projection.elementId);
      if (!element) throw new Error(`Projection ${projection.id} has no profile element.`);
      return {
        start: clonePoint(projection.start),
        end: clonePoint(projection.end),
        profileId: profile.id,
        elementId: element.id,
        projectionId: projection.id,
        tapId: element.tapId ?? null,
        tapRole: element.segmentTapRole ?? null,
      };
    }),
    startPolicy: 'replace-terminal',
    endPolicy: 'replace-terminal',
  };
});
