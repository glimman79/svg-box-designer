# Drawing geometry visual-state contract

Drawing geometry presentation is derived by `getGeometryConstraintVisualState`; it is not document data and never enters History.

- **FREE** means none of the target's stable points participates in a Driving Dimension equation.
- **CONSTRAINED** means at least one stable point participates in a Driving Dimension. Reference Dimensions are measurements and do not count.
- **FULLY_LOCKED** requires an explicit, rigorous proof that the target has zero remaining degrees of freedom. The current equation validator can accept or reject a proposed move, but it does not calculate rank, fixed variables, connected-component freedom, or degrees of freedom. Production therefore does not currently emit `FULLY_LOCKED`.

Connectivity alone, dimension count, dimension kind, orientation, and a rejected drag are not lock proofs. A future general solver can pass its diagnostics through `GeometryFreedomProof`; positive DOF retains FREE/CONSTRAINED classification, while rigorously proven zero DOF emits FULLY_LOCKED.

Visual priority is deterministic: active drag and geometry preselection override click selection, which overrides the base constraint color. Points use the same resolver semantics, but committed endpoints have no always-visible point glyph today; their accepted preselection and selection glyphs remain unchanged.
