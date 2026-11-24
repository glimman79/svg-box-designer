import { memo } from 'react';
import { drawingArcPath } from './drawingArcGeometry';
import { resolveSketchMember } from './sketchPresentation';
import type { DrawingSketchV2 } from './drawingTypes';

export const ReferenceSketch = memo(function ReferenceSketch({ sketch, color, highlighted, excludeIds, inBox }: {
  sketch: DrawingSketchV2; color?: string; highlighted?: boolean; excludeIds?: ReadonlySet<string | undefined>; inBox?: boolean;
}) {
  return <g className={inBox ? "box-reference-members" : "drawing-reference-sketch"} data-highlighted={highlighted || undefined} data-reference-sketch={inBox ? undefined : sketch.id} aria-label={sketch.name}
    style={color ? { stroke: color } : undefined}>
    {sketch.entityOrder.map(id => {
      if (excludeIds?.has(id)) return null;
      const member = resolveSketchMember(sketch, id);
      if (!member) return null;
      switch (member.type) {
        case 'line': return <line key={id} x1={member.start.x} y1={member.start.y} x2={member.end.x} y2={member.end.y} />;
        case 'circle': return <circle key={id} cx={member.center.x} cy={member.center.y} r={member.radius} />;
        case 'arc': return <path key={id} d={drawingArcPath(member)} />;
      }
    })}
  </g>;
});
