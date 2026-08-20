# Changelog

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
