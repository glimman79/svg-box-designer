export type PanelThicknessMetadata = { panelId: string; thicknessMm: number };

export type PanelThicknessState = { panels?: Record<string, PanelThicknessMetadata>; defaultThicknessMm?: number };

export const getPanelThickness = (
  panelId: string | null | undefined,
  panelThicknessState?: PanelThicknessState,
  fallbackThicknessMm?: number,
): number | null => {
  const pmThickness = panelId ? panelThicknessState?.panels?.[panelId]?.thicknessMm : undefined;

  if (Number.isFinite(pmThickness) && (pmThickness as number) > 0) {
    return pmThickness as number;
  }

  if (!panelThicknessState && Number.isFinite(fallbackThicknessMm) && (fallbackThicknessMm as number) > 0) {
    return fallbackThicknessMm as number;
  }

  return null;
};
