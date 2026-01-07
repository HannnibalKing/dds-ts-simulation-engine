/**
 * Example: Determinism test
 * 
 * Verifies that simulation produces identical results
 */

import { DeterminismTester } from '../tools/determinism-test.js';
import type { CanonicalData } from '../core/state.js';
import type { InputEvent } from '../core/input.js';
import type { StepFunction } from '../core/engine.js';
import { FixedMath, Vec2Math } from '../math/index.js';
import type { Fixed, Vec2 } from '../math/index.js';
import { DeterministicRNG } from '../core/engine.js';

/**
 * Test state with random movement
 */
interface TestState {
  readonly position: Vec2;
  readonly rngSeed: bigint;
}

/**
 * Test step with deterministic randomness
 */
function testStep(
  state: TestState,
  inputs: readonly InputEvent[]
): TestState {
  const rng = new DeterministicRNG(state.rngSeed);
  
  // Generate deterministic random movement
  const dx = FixedMath.fromInt(rng.next(10) - 5);
  const dy = FixedMath.fromInt(rng.next(10) - 5);
  
  const newPosition = Vec2Math.add(state.position, { x: dx, y: dy });
  const newSeed = rng.getSeed();

  return {
    position: newPosition,
    rngSeed: newSeed,
  };
}

/**
 * Run determinism test
 */
export function runDeterminismTest(): void {
  console.log('=== Determinism Test ===\n');

  const tester = new DeterminismTester();

  const initialState: TestState = {
    position: Vec2Math.create(0n, 0n),
    rngSeed: 12345n,
  };

  const inputs: InputEvent[] = [];

  console.log('Running simulation 10 times with 1000 ticks each...\n');

  const result = tester.test(
    initialState as unknown as CanonicalData,
    testStep as unknown as StepFunction<CanonicalData>,
    inputs,
    {
    runs: 10,
    ticks: 1000,
  });

  console.log(tester.generateReport(result));

  if (result.passed) {
    console.log('\n✓ All runs produced identical hashes!');
    console.log('Determinism guarantee upheld.');
  } else {
    console.log('\n✗ Runs diverged!');
    console.log('This should never happen in a correct implementation.');
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDeterminismTest();
}
