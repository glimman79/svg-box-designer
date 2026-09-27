import type { DrawingDimension } from './drawingTypes';

export type DimensionAnnotationDragSession = Readonly<{
  pointerId: number;
  id: string;
  startClient: Readonly<{ x: number; y: number }>;
  startPlacement: DrawingDimension['placement'];
  previewPlacement: DrawingDimension['placement'];
  exceeded: boolean;
}>;

export const beginDimensionAnnotationDragSession = (
  pointerId: number,
  dimension: DrawingDimension,
  startClient: Readonly<{ x: number; y: number }>,
): DimensionAnnotationDragSession => ({
  pointerId,
  id: dimension.id,
  startClient,
  startPlacement: dimension.placement,
  previewPlacement: dimension.placement,
  exceeded: false,
});

export const updateDimensionAnnotationDragSession = (
  session: DimensionAnnotationDragSession | null,
  pointerId: number,
  buttons: number,
  client: Readonly<{ x: number; y: number }>,
  previewPlacement: DrawingDimension['placement'],
  thresholdPx: number,
): DimensionAnnotationDragSession | null => {
  if (!session || session.pointerId !== pointerId) return session;
  if ((buttons & 1) === 0) return null;
  const exceeded = session.exceeded
    || Math.hypot(client.x - session.startClient.x, client.y - session.startClient.y) >= thresholdPx;
  return { ...session, previewPlacement, exceeded };
};

export const cancelDimensionAnnotationDragSession = (
  session: DimensionAnnotationDragSession | null,
  pointerId?: number,
) => pointerId === undefined || session?.pointerId === pointerId ? null : session;

export const finishDimensionAnnotationDragSession = (
  session: DimensionAnnotationDragSession | null,
  pointerId: number,
) => session?.pointerId === pointerId
  ? { session: null, commit: session.exceeded ? { id: session.id, placement: session.previewPlacement } : null }
  : { session, commit: null };

export const dimensionPlacementForDisplay = (
  dimension: DrawingDimension,
  session: DimensionAnnotationDragSession | null,
) => session?.id === dimension.id ? session.previewPlacement : dimension.placement;
