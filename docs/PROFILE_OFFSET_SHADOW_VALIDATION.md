# Profile Offset shadow validation

## Scope

This validation does not change or feed the production Profile Offset path. The
shadow resolver accepts only one `GeneratedProfile` and marks its generator-owned
ordered elements eligible. A diagnostic-only projector maps those directed
element references onto the generated contour, then the harness compares that
mask with production provenance. The resolver cannot access legacy segment IDs,
tap roles, corner roles, boundary coincidence, compensation masks, or production
eligibility.

## Coverage and result

`npm run diagnose:profile-offset-shadow` evaluates TB and S profiles with
clockwise and counter-clockwise contours, a reversed source edge, one and
multiple taps, adjacent profiles, multiple profiles on one panel, four operated
edges, and generated corners. It reports every profile and never stops at the
first disagreement.

The committed validation set evaluates **20 profiles**: **6 match** and **14
mismatch**. GeneratedProfile therefore does **not** yet contain sufficient
semantic information to reproduce the exact production eligibility mask.

Every mismatch is a production geometric-filtering difference. Depending on the
fixture, production removes a tap tip or a terminal tap wall from the otherwise
complete profile membership because that segment coincides with imported
geometry. The shadow model identifies ordered ownership, tap order, attachments,
and direction, but it does not author an explicit keep/exclude decision that can
distinguish those cases without reintroducing the forbidden boundary-coincidence
heuristic.

## Interpretation

The mismatch is evidence, not a migration. Production remains authoritative and
unchanged. A future generator model would need to author explicit Profile Offset
eligibility (or equivalent semantics) before a production cutover could preserve
today's masks without consulting legacy geometric inference.
