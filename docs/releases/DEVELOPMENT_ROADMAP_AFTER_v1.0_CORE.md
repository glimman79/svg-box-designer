# Development Roadmap After Version 1.0 Core Engine

Date: 2026-06-26

This roadmap documents future work after the `v1.0-core` baseline. It does not implement any roadmap item.

## Version 1.1

Focus: manufacturing polish and compatibility cleanup while preserving the Version 1.0 core-engine contract.

### Manufacturing

- Joint Clearance
- Manual Clearance Tool
- Kerf Presets

### Workflow

- C improvements
- P improvements
- Small workflow usability improvements that do not destabilize TB, S, or W baselines

### Architecture

- Feature Registry design
- Begin rename plan for internal E terminology to TB
- Identify remaining legacy compatibility names before removal

## Version 1.2

Focus: production workflows, material/machine presets, and CAD-quality editing aids.

### Manufacturing

- Material Library
- Machine Profiles
- Expanded Kerf Presets

### CAD

- Mirror
- Array
- Snap tools
- Parametric rules foundation

### CAM

- Laser profiles
- CNC profiles
- Batch export

### Architecture

- Implement Feature Registry
- Continue renaming internal E terminology to TB
- Remove safe legacy compatibility names after migration tests exist

## Version 2.0

Focus: extensible CAD/CAM platform architecture beyond the Version 1.x core-engine baseline.

### Workflow

- New workflow tools
- Full C improvements
- Full P improvements
- Plugin-style workflow registration

### CAD

- Constraints
- Advanced parametric rules
- Extended Mirror and Array behavior
- Integrated snap/constraint editing model

### CAM

- Cut order planning
- Advanced batch export
- Machine-aware export strategies for laser and CNC profiles

### Architecture

- Plugin-style tool registration
- Complete internal E-to-TB terminology migration
- Remove remaining legacy compatibility names
- Formalize stable public/internal module boundaries
- Expand automated tests around plugin registration, CAD tools, and CAM export paths

## Explicit non-goals for this release document

- Do not implement Joint Clearance.
- Do not implement Manual Clearance Tool.
- Do not implement Material Library.
- Do not implement Kerf Presets.
- Do not implement Machine Profiles.
- Do not implement C/P improvements.
- Do not implement CAD tools.
- Do not implement CAM tools.
- Do not implement Feature Registry.
- Do not rename E terminology in this release-preparation change.
