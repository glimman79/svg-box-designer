// Exact comparison for regenerated plain CAD records. Numbers and array order
// are significant. Repeated Apply may allocate equivalent records.
export function projectDataEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
    || Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && left.length !== (right as unknown[]).length) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every(key => Object.hasOwn(b, key) && projectDataEqual(a[key], b[key]));
}
