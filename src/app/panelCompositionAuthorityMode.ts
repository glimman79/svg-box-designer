import type { PanelCompositionAuthorityMode } from './generatedGeometryAuthority';

export const panelCompositionAuthorityModeEnvironmentVariable = 'VITE_PANEL_COMPOSITION_AUTHORITY_MODE';

export type AuthorityModeDiagnostic = (message: string) => void;

/** Resolves the product-level authority request. The selector's library fallback is intentionally separate. */
export const resolvePanelCompositionAuthorityMode = (rawValue: string | null | undefined,
  diagnostic: AuthorityModeDiagnostic = console.warn): PanelCompositionAuthorityMode => {
  const value = rawValue?.trim() ?? '';
  if (!value) return 'mixed';
  if (value === 'legacy' || value === 'single-tool' || value === 'mixed') return value;
  diagnostic(`Invalid ${panelCompositionAuthorityModeEnvironmentVariable} value ${JSON.stringify(rawValue)}; falling back to legacy authority.`);
  return 'legacy';
};
