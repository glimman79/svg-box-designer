# Wall v2 Step B3.3 Downstream Failure Analysis

## Scope and evidence

This is a read-only production analysis. No `src/` file was changed. The diagnostic fixture uses the six browser panel IDs, four complete W operations, a trailing-placeholder-equivalent absence of W5 geometry, and pre-existing TB ownership on each reported failing panel. It deliberately emits raw carriers, profiles, projections, taps, relationships, candidates, junctions, authority decisions, and the exception hidden by the authority catch.

1. **Files inspected.** `src/App.tsx`, `wallAuthoring.ts`, `wallGeometry.ts`, `tbGeometry.ts`, `tbShadowPanelAdapter.ts`, `panelContributors.ts`, `generatedGeometryAssembly.ts`, `generatedGeometryAuthority.ts`, `generatedGeometryDualRun.ts`, `panelComposer.ts`, `generatedProfiles.ts`, `generatedTaps.ts`, `geometryRelationships.ts`, `finalGeometry.ts`, `manufacturingCompensation.ts`, `manufacturingGeometry.ts`, `manufacturingMetadata.ts`, and the B3.2 diagnostic tests.
2. **Diagnostic-only files changed.** `tests/diagnostics/wall-v2-downstream-diagnostic-analysis.ts`, this report, and one `package.json` script. Production files: none.
3. **Exact Apply path after B3.2.** `App.applyPanelPaths` recalculates TB/S automatic values; calls `validateGeometryAuthoring`; calls `validateWallAuthoringForApply`; independently calls `buildGeneratedTBGeometryItems`, `buildGeneratedWGeometryItems`, and `buildGeneratedSGeometryItems`; concatenates those fresh arrays; and calls `selectGeneratedGeometryAuthority(..., panelCompositionAuthorityMode)`. Authority calls `assembleGeneratedGeometryDiagnostics`, which audits/indexes relationships, groups profiles by `generatorType`, looks up TB/W/S in `defaultPanelContributorRegistry`, adapts TB/W through `adaptFingerJointProfilesToPanelContributions`, and calls `composePanel`. For a valid mixed candidate authority calls `packageComposedPanelGeometry`, then `buildFinalGeometry`, then `processManufacturingGeometry`. The package call throws before the last two calls. Authority catches without retaining the exception and assigns `DOWNSTREAM_DIAGNOSTIC_FAILURE`. App formats that reason per blocking panel.
4. **Exact wrapper location.** `selectGeneratedGeometryAuthority`: a `MIXED_NO_LEGACY_ORACLE` candidate in `mixed` mode enters the downstream gate. Any exception from packaging/final/manufacturing is caught by an empty `catch`, setting `downstreamGate = 'FAILED'`; the reason ternary then produces `DOWNSTREAM_DIAGNOSTIC_FAILURE`. The selection result preserves candidate/composer diagnostics but does **not** preserve the caught exception.
5. **panel-1 underlying diagnostic.** Thrown packaging error (not a typed warning/error diagnostic): `Conflicting diagnostic packaging carrier generated:panel:panel-1 for panel-1.` Subsystem: diagnostic packaging. Both TB1 and W1 raw panel carriers have the same item ID but unequal content.
6. **panel-3 underlying diagnostic.** `Conflicting diagnostic packaging carrier generated:panel:panel-3 for panel-3.` TB2/W2 carrier ID collision.
7. **panel-5 underlying diagnostic.** `Conflicting diagnostic packaging carrier generated:panel:panel-5 for panel-5.` TB3/W3 carrier ID collision.
8. **panel-6 underlying diagnostic.** `Conflicting diagnostic packaging carrier generated:panel:panel-6 for panel-6.` TB4/W4 carrier ID collision.
9. **First subsystem emitting the real error.** `packageComposedPanelGeometry` in diagnostic/generated-geometry packaging (stage E), before FinalGeometry.
10. **Exact failing invariant.** Packaging builds `carriersById`. TB and W independently emit `id = generated:panel:${panel.id}`. When a panel is mixed TB+W, the second unequal carrier shares the first carrier's ID; packaging requires equal content for a repeated ID and throws.
11. **W contribution entering panel-1.** W1, `operation:W:W1`, role A, `panel-1-edge-1`, `profile:W:W1:panel-1:panel-1-edge-1`; attachments/supports and all projections/taps are printed by the fixture. It is adjacent to TB1 on edge 0; edges 2/3 are untouched.
12. **W contribution entering panel-3.** W2, `operation:W:W2`, role B, edge 1 and corresponding native profile; adjacent TB2 on edge 0; edges 2/3 untouched.
13. **W contribution entering panel-5.** W3, `operation:W:W3`, role A, edge 1 and corresponding native profile; adjacent TB3 on edge 0; edges 2/3 untouched.
14. **W contribution entering panel-6.** W4, `operation:W:W4`, role B, edge 1 and corresponding native profile; adjacent TB4 on edge 0; edges 2/3 untouched.
15. **W raw carriers per failing panel.** Exactly one W `PANEL_PATH` per affected panel, plus exactly one TB `PANEL_PATH`; each W affected-panel carrier has one profile group/profile and its generated taps. The common W mate, panel-2, has one coherent W carrier containing W1-W4.
16. **Coherent batch result.** Pass. W is generated once from all W assignments; no W subset is appended. Per panel there is one W carrier, operations are combined into its carrier operation ID, and profile/relationship provenance covers each operated edge.
17. **Adapter TB/W equivalence.** Pass. Both registrations use the exact same function. Paired profiles normalize to identical panel/source traversal, supports, terminal policies, geometry ordering, and tap semantics; only native identities differ. The failure occurs after adaptation and composition.
18. **Remaining TB hardcoding discovered.** No reached `operation:TB:`, `profile:TB:`, or TB-only generator branch exists in assembly, composer, packaging, relationship audit, FinalGeometry, or manufacturing. The adapter's explicit TB/W allow-list is intentional. The relevant remaining assumption is not TB-specific text: the shared finger-joint generator gives every tool's panel carrier the tool-neutral ID `generated:panel:<panelId>`.
19. **Relationship audit result.** Pass. Each profile creates one `replaces` relationship with correct operation, panel, source edge, and native profile provenance. No overlapping source edge, duplicate provenance disagreement, missing relationship, or replacement conflict occurs.
20. **Replacement ownership result.** Pass. Each operated source edge has exactly one claimant. TB and W own distinct adjacent edges.
21. **Composer input result.** Correct ordered outer contour; exactly one TB replacement, one W replacement, and two unchanged edges on each affected panel. Contributions are neither duplicated nor missing.
22. **Composer junction result.** Pass. Four finite junctions are produced per affected rectangle; composer diagnostics are empty.
23. **Ring validity result.** Candidate rings are closed-by-packaging construction, non-empty, without zero-length emitted segments or composer `invalid-ring`. Physical validity is not the failing gate.
24. **Packaging result.** Fail, deterministically, at duplicate unequal carrier identity. No composed item is produced for an affected panel.
25. **Legacy/oracle comparison result.** Each mixed panel is correctly `MIXED_NO_LEGACY_ORACLE`; no legacy equality is required. Failure is not `LEGACY_MISMATCH`.
26. **Physical invalidity?** No evidence of invalid W geometry; composer candidates and junctions are valid, and packaging prevents FinalGeometry from running.
27. **Only representational/equivalence mismatch?** Yes: conflicting non-unique carrier representation/identity, not contour geometry or legacy equivalence.
28. **W1-only pass?** No when panel-1 already has TB: it is the smallest reproducer and fails with the same carrier collision. A W-only panel passes (panel-2 in the same run).
29. **W1+W2 pass?** No; panel-1 and panel-3 fail.
30. **W1+W2+W3 pass?** No; panel-1, panel-3, and panel-5 fail.
31. **W1+W2+W3+W4 fail?** Yes; all four named panels fail.
32. **Smallest failing topology.** One TB-operated edge plus one W-operated edge on the same panel; adjacency/role is immaterial to the observed exception because packaging keys only by carrier ID.
33. **Equivalent TB topology result.** Pass. Generating baseline and new edges in one all-TB coherent batch creates one carrier per panel, so no duplicate carrier ID reaches packaging.
34. **Exact W/TB non-identity difference.** Geometry is equivalent after native identity normalization. The decisive raw-stream difference is batch partitioning: equivalent all-TB operations cohabit one panel carrier, whereas TB+W necessarily produce two unequal carriers with the same supposedly unique `generated:panel:<panelId>` ID.
35. **Existing TB generated-state interaction.** Existing TB *authoring* is regenerated fresh and mixed with fresh W. Old generated state is not required.
36. **Stale/duplicate carrier result.** No stale carrier survives Apply and neither tool is registered/generated twice. There are two legitimate cross-tool carriers, but their IDs duplicate. Thus this is duplicate identity, not stale state or duplicate generation.
37. **Why B3.2 production-path passed.** Its W-only owner panels and separate TB owner panels never place TB and W carriers on the same panel. Its “mixed” assertion means a raw project containing both tools on distinct panels; each panel remains a single-tool cohort.
38. **Exact missing coverage.** No TB+W same-panel ownership, no cross-tool panel-carrier ID collision, and no mixed downstream packaging gate. Multiple W edges and realistic box-net layout are not prerequisites for this bug.
39. **Root cause identified?** Yes.
40. **Smallest likely B3.4 production fix.** Make raw generated panel-carrier identity contributor/tool scoped (or otherwise make packaging distinguish legitimate per-tool carriers) while preserving relationship owners and coherent batches. Validate snapshots/restore implications. This is a recommendation only.
41. **Production code changed?** No.
42. **Tests/checks run.** See commit/PR report; all requested commands were run.
43. **Commit hash.** Recorded in the final response because a document cannot know its own commit hash.
44. **Ready for B3.4?** Yes: the failure point, invariant, smallest reproducer, and likely fix surface are bounded.

## Explicit conclusions

The aggregate DOWNSTREAM_DIAGNOSTIC_FAILURE has been expanded to the real underlying diagnostic: **YES**.

The first failing subsystem is identified: **YES**.

The failure is caused by invalid W physical geometry: **NO**.

The failure is caused by a remaining TB-only downstream assumption: **NO** (it is a contributor-neutral carrier-ID uniqueness assumption exposed by TB+W).

The failure is caused by stale/duplicate generated carriers: **NO** for stale/duplicate generation; **YES** for colliding carrier identity.

The failure first appears with multiple W operations on one panel: **NO**.

Equivalent TB topology passes: **YES**.

The real browser failure is reproduced automatically: **YES**, including the same four panel IDs and aggregate reason.

Production code modified in this analysis: **NO**.

Exact root cause identified: **YES**.

Ready for focused B3.4 production fix: **YES**.
