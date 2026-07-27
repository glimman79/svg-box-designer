import type { GeneratedProfileId } from './generatedProfiles';

export type ProjectSettings = {
  kerfMm: number;
  clearanceMm: number;
  slotClearanceMm: number;
  selectedClearanceProfileIds: GeneratedProfileId[];
};

export type ProjectSettingsNormalization = { settings: ProjectSettings; diagnostics: string[] };

const finiteOr = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Pure compatibility boundary for future serialized project settings. */
export const normalizeProjectSettings = (value: Partial<ProjectSettings> | null | undefined): ProjectSettingsNormalization => {
  const diagnostics: string[] = [];
  const rawIds: unknown = value?.selectedClearanceProfileIds ?? [];
  const ids = Array.isArray(rawIds)
    ? rawIds.filter((id): id is GeneratedProfileId => {
      const valid = typeof id === 'string' && id.length > 0;
      if (!valid) diagnostics.push('Discarded a malformed Clearance profile selection.');
      return valid;
    })
    : [];
  if (!Array.isArray(rawIds)) diagnostics.push('Clearance profile selections were not an array and were reset safely.');
  return {
    settings: {
      kerfMm: finiteOr(value?.kerfMm, 0.15),
      clearanceMm: finiteOr(value?.clearanceMm, 0),
      slotClearanceMm: finiteOr(value?.slotClearanceMm, -0.10),
      selectedClearanceProfileIds: [...new Set(ids)],
    },
    diagnostics,
  };
};
