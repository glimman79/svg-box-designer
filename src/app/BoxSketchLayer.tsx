import { memo, useMemo } from 'react';
import { currentBoxGeometrySnapshot, isSourceApproved, sourceStatus } from './boxSources';
import type { SketchDefinition } from './constructionOperations';
import { buildFinalGeometry } from './finalGeometry';
import { processManufacturingGeometry } from './manufacturingCompensation';
import type { ManufacturingGeometry } from './manufacturingGeometry';
import type { BoxStateSource } from './projectState';
import { ReferenceSketch } from './ReferenceSketch';
import { pointsToClosedPathD } from './sharedGeometry';
import { neutralSketchColor } from './sketchPresentation';

export function previewContours(final: ReturnType<typeof buildFinalGeometry>, settings: BoxStateSource['projectSettings']) {
  return processManufacturingGeometry(final, settings.kerfMm, settings.slotClearanceMm,
    settings.profileOffsetMm, settings.selectedProfileOffsetIds, settings.tapClearanceMm);
}

export const BoxSketchLayer = memo(function BoxSketchLayer({ definition, box, activePreview, highlighted }: {
  definition: SketchDefinition; box: BoxStateSource; activePreview?: ManufacturingGeometry; highlighted: boolean;
}) {
  const { sketch, operation } = definition;
  const { svgModel, projectSettings } = box;
  const approved = isSourceApproved(box);
  const currentGeometry = currentBoxGeometrySnapshot(box);
  const preview = useMemo(() => {
    if (!approved) return undefined;
    return activePreview ?? previewContours(buildFinalGeometry(svgModel,
      currentGeometry ?? []), projectSettings);
  }, [approved, activePreview, svgModel, currentGeometry, projectSettings]);
  const panelLines = useMemo(() => new Set(svgModel.edges.map(edge => edge.drawingEntityId)), [svgModel]);
  const panelHitPath = useMemo(() => preview ? preview.contours.map(c => c.pathD).join(' ')
    : svgModel.panels.flatMap(p => [p.outerContour, ...p.innerContours].map(pointsToClosedPathD)).join(' '), [preview, svgModel]);
  // Open or unsupported members remain visible alongside the accepted contours.
  const excluded = approved ? panelLines : undefined;
  return <g className="box-reference" data-source-id={operation.id} data-status={sourceStatus(box)}
    data-highlighted={highlighted || undefined} data-working={!!activePreview || undefined}
    color={approved ? neutralSketchColor(operation) : '#b9bfc5'}>
    <title>{sketch.name} · {sourceStatus(box)}</title>
    <ReferenceSketch inBox sketch={sketch} excludeIds={excluded} />
    {preview && <g className={activePreview ? 'final-contour-kerf-layer' : 'box-reference-contours'}>
      {preview.contours.map(c => <path key={c.id} className={c.kind === 'INNER' ? 'final-slot-path' : 'final-panel-path'} d={c.pathD} />)}
    </g>}
    <g className="box-source-hit" aria-hidden="true">
      <ReferenceSketch inBox sketch={sketch} excludeIds={excluded} />
      <path className="box-panel-hit" d={panelHitPath} fillRule="evenodd" />
    </g>
  </g>;
});

/** SVG hit testing includes every owner under the pointer, including occluded targets. */
export function sourceHits(x: number, y: number) {
  const ids = new Set<string>();
  for (const element of document.elementsFromPoint(x, y)) {
    const id = element.closest('[data-source-id]')?.getAttribute('data-source-id');
    if (id) ids.add(id);
  }
  return [...ids];
}
