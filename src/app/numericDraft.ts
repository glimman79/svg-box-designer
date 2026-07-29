export const formatFixedNumericValue = (value: number | null, precision = 2): string => value?.toFixed(precision) ?? '';

export const parseCompleteNumericDraft = (draft: string, min?: number): number | null => {
  const normalized = draft.replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && (min === undefined || parsed >= min) ? parsed : null;
};
