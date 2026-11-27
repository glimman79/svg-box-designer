/** A failure attributable to one connection or to a batch that must stay together. */
export class GeometryDependencyError extends Error {
  constructor(readonly connectionIds: readonly string[], message: string) {
    super(message);
    this.name = 'GeometryDependencyError';
  }
}
