import type { GeneratedProfileId } from './generatedProfiles';

export type ProjectSettings = {
  kerfMm: number;
  profileOffsetMm: number;
  slotClearanceMm: number;
  selectedProfileOffsetIds: GeneratedProfileId[];
  tapClearanceMm: number;
};

type LegacyProjectSettings = Partial<ProjectSettings> & {
  clearanceMm?: number;
  selectedClearanceProfileIds?: GeneratedProfileId[];
};

export type ProjectSettingsNormalization = { settings: ProjectSettings; diagnostics: string[] };

const finiteOr = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Pure compatibility boundary for future serialized project settings. */
export const normalizeProjectSettings = (value: LegacyProjectSettings | null | undefined): ProjectSettingsNormalization => {
  const diagnostics: string[] = [];
  const rawIds: unknown = value?.selectedProfileOffsetIds ?? value?.selectedClearanceProfileIds ?? [];
  const ids = Array.isArray(rawIds)
    ? rawIds.filter((id): id is GeneratedProfileId => {
      const valid = typeof id === 'string' && id.length > 0;
      if (!valid) diagnostics.push('Discarded a malformed Profile Offset profile selection.');
      return valid;
    })
    : [];
  if (!Array.isArray(rawIds)) diagnostics.push('Profile Offset profile selections were not an array and were reset safely.');
  return {
    settings: {
      kerfMm: finiteOr(value?.kerfMm, 0.15),
      profileOffsetMm: finiteOr(value?.profileOffsetMm ?? value?.clearanceMm, 0),
      slotClearanceMm: finiteOr(value?.slotClearanceMm, -0.10),
      selectedProfileOffsetIds: [...new Set(ids)],
      tapClearanceMm: finiteOr(value?.tapClearanceMm, -0.10),
    },
    diagnostics,
  };
};
