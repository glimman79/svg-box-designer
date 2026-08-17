/** Compatibility surface for the original diagnostic imports. */
export {
  composePanel as composeShadowPanel,
} from './panelComposer';
export type {
  PanelTerminalPolicy as ShadowTerminalPolicy,
  PanelSegment as ShadowSegment,
  PanelUnchangedEdgeContribution as ShadowUnchangedEdgeContribution,
  PanelReplacedEdgeContribution as ShadowReplacedEdgeContribution,
  PanelContribution as ShadowPanelContribution,
  PanelComposerDiagnostic as ShadowComposerDiagnostic,
  PanelCandidateSegment as ShadowCandidateSegment,
  PanelCandidate as ShadowPanelCandidate,
} from './panelComposer';
export { adaptSProfilesToPanelContributions as adaptSProfilesToShadowContributions } from './sPanelContributionAdapter';
