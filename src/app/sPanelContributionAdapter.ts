/** S-A adapter from native profiles to the generic panel contribution contract. */
import type { GeneratedProfile } from './generatedProfiles';
import type { PanelReplacedEdgeContribution } from './panelComposer';
import type { Point } from '../svgUtils';

const clonePoint = (point: Point): Point => ({ x: point.x, y: point.y });

export const adaptSProfilesToPanelContributions = (
  profiles: ReadonlyArray<GeneratedProfile>,
): ReadonlyArray<PanelReplacedEdgeContribution> => profiles.map((profile) => {
  if (profile.generatorType !== 'S') throw new Error(`Profile ${profile.id} is not an S profile.`);
  const elementById = new Map(profile.orderedElements.map((element) => [element.id, element]));
  const support = { start: clonePoint(profile.attachmentStart), end: clonePoint(profile.attachmentEnd) };
  return {
    kind: 'replaced', panelId: profile.panelId, sourceEdgeId: profile.sourceEdgeId,
    operationId: profile.operationId, profileId: profile.id,
    sourceTraversal: { start: clonePoint(profile.sourceEdgeDirection.start), end: clonePoint(profile.sourceEdgeDirection.end) },
    startSupport: support, endSupport: support, startPolicy: 'replace-terminal', endPolicy: 'replace-terminal',
    geometry: profile.geometryProjections.map((projection) => {
      const element = elementById.get(projection.elementId);
      if (!element) throw new Error(`Projection ${projection.id} has no profile element.`);
      return { start: clonePoint(projection.start), end: clonePoint(projection.end), profileId: profile.id,
        elementId: projection.elementId, projectionId: projection.id, tapId: element.tapId ?? null,
        tapRole: element.segmentTapRole ?? null };
    }),
  };
});
