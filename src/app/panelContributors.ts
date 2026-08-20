import type { GeneratedProfile } from './generatedProfiles';
import type { PanelReplacedEdgeContribution } from './panelComposer';
import { adaptSProfilesToPanelContributions } from './sPanelContributionAdapter';
import { adaptTBProfilesToPanelContributions } from './tbShadowPanelAdapter';

/** Built-in identities remain literals; extension identities can only be made through the validating constructor. */
export type ExtensionPanelContributorType = string & { readonly __brand: 'ExtensionPanelContributorType' };
export type PanelContributorType = 'TB' | 'S' | ExtensionPanelContributorType;

export const createExtensionPanelContributorType = (value: string): ExtensionPanelContributorType => {
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(value) || value === 'TB' || value === 'S') {
    throw new Error(`Invalid extension panel contributor identity: ${JSON.stringify(value)}.`);
  }
  return value as ExtensionPanelContributorType;
};

export type PanelContributorDefinition = Readonly<{
  contributorType: PanelContributorType;
  adaptProfiles: (profiles: ReadonlyArray<GeneratedProfile>) => ReadonlyArray<PanelReplacedEdgeContribution>;
}>;

export type PanelContributorRegistry = ReadonlyMap<PanelContributorType, PanelContributorDefinition>;

export const createPanelContributorRegistry = (
  definitions: ReadonlyArray<PanelContributorDefinition>,
): PanelContributorRegistry => {
  const registry = new Map<PanelContributorType, PanelContributorDefinition>();
  definitions.forEach((definition) => {
    if (registry.has(definition.contributorType)) throw new Error(`Duplicate panel contributor ${definition.contributorType}.`);
    registry.set(definition.contributorType, Object.freeze({ ...definition }));
  });
  return registry;
};

export const defaultPanelContributorRegistry = createPanelContributorRegistry([
  { contributorType: 'TB', adaptProfiles: adaptTBProfilesToPanelContributions },
  { contributorType: 'S', adaptProfiles: adaptSProfilesToPanelContributions },
]);
