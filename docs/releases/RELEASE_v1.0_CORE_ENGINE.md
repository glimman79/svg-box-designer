# Version 1.0 Core Engine

## Release identity

- Version: `v1.0-core`
- Release title: Version 1.0 Core Engine
- Date: 2026-06-26
- Purpose: stable core-engine baseline and permanent rollback point for future development.

This release is documentation-only. It does not change application behavior, geometry, code logic, or feature implementation.

## Implemented capabilities

- SVG import
- PDF import: not currently supported by the repository; no PDF importer is present in the current codebase.
- Robust SVG transform/matrix import
- TB workflow
- W workflow
- S workflow
- Manufacturing tool
- MFG History
- Workflow History
- History navigation
- Final Geometry pipeline
- Manufacturing pipeline
- Slot Clearance
- Kerf
- Robust contour offset for stepped finger-joint geometry
- Preview
- Export
- Preview = Export
- Stable contour classification
- Stable Final Geometry architecture
- Stable Manufacturing Geometry architecture

## Architecture summary

```text
Original Geometry
↓
Workflow Engine
↓
Final Geometry
↓
Manufacturing
Slot Clearance
↓
Kerf
↓
Manufacturing Geometry
↓
Preview / Export
```

The application imports SVG source geometry, assigns workflow metadata to panel edges, builds stable Final Geometry from original and applied workflow geometry, applies manufacturing compensation through slot-clearance and kerf stages, and uses the same manufacturing geometry for preview and export.

## Validation results

- `npm run build`: passed on 2026-06-26.
- `npm test`: passed on 2026-06-26. The test command emitted expected console warnings about mismatched E connection side lengths while completing successfully.

## Repository state at release preparation

- Branch checked during preparation: `work`
- Starting commit checked during preparation: `20d181f46e4dac3bb891bc990b908de0ddbb53d2`
- Merge conflicts: none detected by `git ls-files -u`.
- Uncommitted source changes before release documentation: none detected by `git status --short`.
- Ignored generated/dependency folders present after validation: `dist/`, `node_modules/`, `tsconfig.app.tsbuildinfo`, `tsconfig.node.tsbuildinfo`.

## Repository health report

### Current files and folders

Tracked project areas at this baseline include:

- Root application/configuration files: `README.md`, `Architecture.md`, `package.json`, `index.html`, TypeScript configs, and Vite config.
- `src/`: React application, SVG parsing utilities, styles, and core app modules.
- `src/app/`: workflow, geometry, manufacturing, final-geometry, export, contour-classification, assignment, and connection modules.
- `tests/`: baseline regression tests and mirrored helper modules used by the Node-based tests.
- `docs/`: historical baseline documentation.
- `docs/releases/`: Version 1.0 Core Engine release documentation.
- `screenshots/`: existing UI reference SVG screenshots.

Ignored local/generated areas include:

- `node_modules/`
- `dist/`
- TypeScript build-info files

### Deprecated compatibility code

- Legacy E-system compatibility remains in current runtime and test naming.
- Historical baseline documents for E and E+S remain in `docs/`.
- Internal exports continue to expose E-named helpers for compatibility.

### TODO markers

- No `TODO` markers were found in non-generated project files during release preparation.

### FIXME markers

- No `FIXME` markers were found in non-generated project files during release preparation.

### Known duplicate helpers

- Test helper mirrors exist under `tests/app/` for selected `src/app/` modules so tests can execute TypeScript-derived logic in the Node test harness.
- Shared geometry helper responsibilities are split between `sharedGeometry.ts`, `sharedPanelGeometry.ts`, and selected legacy E geometry helpers.

### Dead exports

- No dead-export analysis tool was run for this release snapshot.
- No confirmed dead exports are documented for this baseline.

### Remaining legacy naming

- Internal E naming still exists as a legacy implementation detail.
- `AppliedEPanelPath` / `appliedEPanelPaths` still exist as internal intermediate names.
- `eGeometry.ts` still exists as a legacy internal geometry module name.
- User-facing TB workflow aliases coexist with E-prefixed implementation details.

## Known limitations

- Joint Clearance not implemented
- Manual Clearance Tool not implemented
- Future workflow tools not implemented
- Feature Registry not implemented
- Internal E naming still exists as legacy implementation detail
- AppliedEPanelPath / appliedEPanelPaths still exist as internal intermediate names
- eGeometry.ts still exists as legacy internal geometry module name

## Rollback instructions

To return to this stable version later:

```bash
git checkout v1.0-core
```

Or create a branch from it:

```bash
git checkout -b restore-v1.0-core v1.0-core
```

## Release commands

Commands used or intended for this release baseline:

```bash
git status
git add docs/releases/RELEASE_v1.0_CORE_ENGINE.md docs/releases/ARCHITECTURE_v1.0_CORE_ENGINE.md docs/releases/DEVELOPMENT_ROADMAP_AFTER_v1.0_CORE.md
git commit -m "docs: create v1.0 core engine release snapshot"
git tag v1.0-core
git push
git push origin v1.0-core
```

## Version 1.1 readiness

The repository is ready for Version 1.1 development after this release documentation is committed and the `v1.0-core` tag is created. Future work should preserve this tag as the rollback anchor and should avoid modifying the Version 1.0 release documentation except to add errata.
