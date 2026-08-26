# Changelog

## V1.2 — TB + Wall Stabilization

- Retains the stable TB workflow and stabilizes the Wall/W finger-joint workflow, including Wall A/B role normalization and mouse-hole prevention/orientation behavior.
- Shares physical finger-joint semantics across TB and W, including TB + W mixed composition, while same-edge replacement ownership remains fail-closed.
- Adds generic post-composition metadata reconciliation and explicit nonphysical projection lineage for supported composition topologies; this release does not claim support for every theoretical SPLIT/COALESCED topology.
- Supports per-connection Tab/finger width so different Tab sizes can coexist in one project and finished groups remain isolated from later Tab edits.
- Gives W the same compact PM thickness / Tab UI behavior as TB.
- Validates FinalGeometry and manufacturing for supported Wall workflows.
- Keeps History, Undo/Redo, and workflow state compatible with the current connection model.
- B3.23 product acceptance concluded that Wall is stable enough to leave stabilization.

## Authority Step C

- Promoted mixed panel-composition authority to the application default while retaining explicit restricted `single-tool` and historical `legacy` rollback modes. Same-edge conflicts remain fail-closed, S-B references retain original-source semantics, and stored projects migrate lazily only on fresh Apply rather than being recomposed during restore.

## V1.1

- Stable PM importer workflow.
- Panel/hole containment works.
- Nested panels inside holes work.
- PM side panel simplified.
- TB and S side panels unified.
- Duplicate Basic/diagnostic UI removed.
- Tool labels are smaller and cleaner.
- TB label identity fixed.
- Finish cleanup works.
- Import fixtures/regression tests added.
