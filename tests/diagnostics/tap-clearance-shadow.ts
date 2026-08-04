import { createGeneratedProfile } from '../../src/app/generatedProfiles';
import { createGeneratedTapId, isTapClearanceEligibleRole, type GeneratedTapGroup, type GeneratedTapSegmentRole } from '../../src/app/generatedTaps';
import { resolveTapClearanceElementIds } from '../../src/app/tapClearance';
import { resolveTapClearanceShadow, type TapClearanceShadowDecision } from './tap-clearance-shadow-resolver';

const invariant: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };
const names = [
  'horizontal-multiple', 'vertical-multiple', 'single-tap', 'tap-at-start-attachment',
  'tap-at-end-attachment', 'leading-straight', 'trailing-straight', 'reversed-source-edge',
  'clockwise-contour', 'counterclockwise-contour', 'tb-generated', 's-generated-male',
  'two-adjacent-profiles', 'four-generated-profiles', 'previous-center-panel',
  'previous-side-panels', 'previous-lower-panel',
] as const;

const profileFor = (name: string, fixtureIndex: number) => {
  const only = name === 'single-tap'; const count = only ? 1 : 3;
  const vertical = name === 'vertical-multiple'; const reverse = name === 'reversed-source-edge';
  const transform = (x: number, y: number) => vertical ? { x: 50 - y, y: x + fixtureIndex * 100 } : { x: reverse ? 100 - x : x, y: y + fixtureIndex * 20 };
  const taps: GeneratedTapGroup[] = Array.from({ length: count }, (_, tapIndex) => ({
    id: createGeneratedTapId({ toolType: name === 's-generated-male' ? 'S' : 'TB', sourceOperationId: name, panelId: `${name}-panel`, sourceEdgeId: `${name}-edge`, tapIndex }),
    sourceOperationId: name, panelId: `${name}-panel`, sourceEdgeId: `${name}-edge`,
    points: [transform(10 + tapIndex * 25, 0), transform(10 + tapIndex * 25, 5), transform(20 + tapIndex * 25, 5), transform(20 + tapIndex * 25, 0)],
    segmentRoles: ['tap-side-start', 'tap-tip', 'tap-side-end'],
  }));
  return createGeneratedProfile({ toolType: name === 's-generated-male' ? 'S' : 'TB', connectionId: name, operationId: name,
    panelId: `${name}-panel`, sourceEdgeId: `${name}-edge`, sourceEdgeStart: transform(reverse ? 100 : 0, 0), sourceEdgeEnd: transform(reverse ? 0 : 100, 0),
    attachmentStart: transform(0, 0), attachmentEnd: transform(100, 0), taps });
};

const productionRole = (decision: TapClearanceShadowDecision): GeneratedTapSegmentRole => decision.wallPosition === 'leading' ? 'tap-side-start' : decision.wallPosition === 'trailing' ? 'tap-side-end' : 'tap-tip';
const category = (decision: TapClearanceShadowDecision) => decision.tapPosition === 'only' ? 'SINGLE_TAP_POLICY_DIFFERENCE'
  : decision.reason === 'FIRST_TAP_OUTER_WALL_FIXED' ? 'PRODUCTION_INCLUDES_FIRST_OUTER_WALL'
  : decision.reason === 'LAST_TAP_OUTER_WALL_FIXED' ? 'PRODUCTION_INCLUDES_LAST_OUTER_WALL' : 'OTHER';
const signature = (decisions: readonly TapClearanceShadowDecision[]) => decisions.map(({ tapIndex, tapCount, tapPosition, wallPosition, profileRelationship, eligible, reason }) => ({ tapIndex, tapCount, tapPosition, wallPosition, profileRelationship, eligible, reason }));

let profiles = 0; let taps = 0; let walls = 0; let eligibleWalls = 0; let fixedWalls = 0; let matches = 0; let mismatches = 0; let singles = 0;
const mismatchCounts = new Map<string, number>(); const projectionFailures = new Map<string, number>(); let invariantSignature = '';
names.forEach((name, fixtureIndex) => {
  const profile = profileFor(name, fixtureIndex); const before = JSON.stringify(profile); const decisions = resolveTapClearanceShadow(profile);
  const productionElements = resolveTapClearanceElementIds(profile);
  invariant(JSON.stringify(profile) === before, `${name}: validation resolver mutated generator geometry`);
  const currentSignature = JSON.stringify(signature(decisions));
  if (name !== 'single-tap') { if (!invariantSignature) invariantSignature = currentSignature; else invariant(currentSignature === invariantSignature, `${name}: equivalent profile changed semantic decisions`); }
  profiles += 1; taps += profile.orderedTaps.length; if (profile.orderedTaps.length === 1) singles += 1;
  console.log(`\nProfile ID: ${profile.id}\nPanel: ${profile.panelId}\nGenerator: ${profile.generatorType}\nOperation: ${profile.operationId}\nSource edge: ${profile.sourceEdgeId}\nProfile direction: ${JSON.stringify(profile.sourceEdgeDirection)}\nAttachment start: ${JSON.stringify(profile.attachmentStart)}\nAttachment end: ${JSON.stringify(profile.attachmentEnd)}\nTap count: ${profile.orderedTaps.length}`);
  decisions.forEach((decision) => {
    const legacy = isTapClearanceEligibleRole(productionRole(decision));
    const production = productionElements.has(decision.elementId); const match = production === decision.eligible;
    if (decision.wallPosition !== 'tip') { walls += 1; decision.eligible ? eligibleWalls += 1 : fixedWalls += 1; }
    match ? matches += 1 : mismatches += 1;
    if (!match) mismatchCounts.set(category(decision), (mismatchCounts.get(category(decision)) ?? 0) + 1);
    if (decision.projectionStatus !== 'ONE_PROJECTED_PRIMITIVE') projectionFailures.set(decision.projectionStatus, (projectionFailures.get(decision.projectionStatus) ?? 0) + 1);
    console.log(`${decision.wallPosition === 'tip' ? 'Tip' : decision.wallPosition === 'leading' ? 'Leading wall' : 'Trailing wall'}:\n- Tap ID: ${decision.tapId}\n- Tap index: ${decision.tapIndex}\n- Position: ${decision.tapPosition}\n- element ID: ${decision.elementId}\n- semantic eligibility: ${decision.eligible}\n- reason: ${decision.reason}\n- projection status: ${decision.projectionStatus}\n- legacy role eligibility: ${legacy}\n- production semantic eligibility: ${production}\n- ${match ? 'match' : `mismatch (${category(decision)})`}`);
  });
});

invariant(eligibleWalls === 64 && fixedWalls === 34, 'terminal-preservation wall totals changed');
invariant(projectionFailures.size === 0, 'expected unambiguous one-to-one projections');
console.log(`\nTOTALS\nProfiles evaluated: ${profiles}\nTaps evaluated: ${taps}\nWalls evaluated: ${walls}\nSemantic eligible walls: ${eligibleWalls}\nSemantic fixed walls: ${fixedWalls}\nProduction matches: ${matches}\nProduction mismatches: ${mismatches}\nMismatch counts by category: ${[...mismatchCounts].map(([key, value]) => `${key}=${value}`).join(', ')}\nProjection failures by category: ${projectionFailures.size ? [...projectionFailures].map(([key, value]) => `${key}=${value}`).join(', ') : 'none'}\nSingle-tap profiles: ${singles}\nEquivalent rotated/reversed/winding/panel cases: identical\nTop/bottom/side/center/lower semantic rule: identical`);
