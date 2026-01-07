/**
 * Example: Simple counter simulation
 * 
 * Demonstrates basic deterministic simulation with fixed-point math
 */

import { SimulationEngine } from '../core/engine.js';
import type { CanonicalData } from '../core/state.js';
import type { InputEvent } from '../core/input.js';
import type { StepFunction } from '../core/engine.js';
import { FixedMath, FIXED_ONE } from '../math/index.js';
import type { Fixed } from '../math/index.js';

/**
 * Counter state
 */
interface CounterState {
  readonly count: Fixed;
  readonly increment: Fixed;
  readonly history: readonly Fixed[];
}

/**
 * Create initial counter state
 */
function createInitialState(): CounterState {
  return {
    count: 0n,
    increment: FIXED_ONE, // 1.0
    history: [],
  };
}

/**
 * Counter step function
 */
function counterStep(
  state: CounterState,
  inputs: readonly InputEvent[]
): CounterState {
  let newCount = state.count;
  let newIncrement = state.increment;

  // Process inputs
  for (const input of inputs) {
    switch (input.type) {
      case 'increment':
        newCount = FixedMath.add(newCount, newIncrement);
        break;
      
      case 'set-increment':
        if (typeof input.payload === 'bigint') {
          newIncrement = input.payload;
        }
        break;
      
      case 'reset':
        newCount = 0n;
        break;
    }
  }

  // Add to history (keep last 10)
  const newHistory = [...state.history, newCount].slice(-10);

  return {
    count: newCount,
    increment: newIncrement,
    history: newHistory,
  };
}

/**
 * Run counter example
 */
export function runCounterExample(): void {
  console.log('=== Counter Example ===\n');

  const engine = new SimulationEngine<CanonicalData>({
    initialState: createInitialState() as unknown as CanonicalData,
    step: counterStep as unknown as StepFunction<CanonicalData>,
  });

  // Add some inputs
  engine.addInput({
    tick: 0,
    type: 'increment',
    payload: null,
  });

  engine.addInput({
    tick: 5,
    type: 'set-increment',
    payload: FixedMath.fromInt(2),
  });

  engine.addInput({
    tick: 10,
    type: 'increment',
    payload: null,
  });

  // Run simulation
  for (let tick = 0; tick < 20; tick++) {
    engine.executeTick();
    const state = engine.getState() as unknown as CounterState;
    
    if (tick % 5 === 0) {
      console.log(`Tick ${tick}: count = ${FixedMath.toFloat(state.count).toFixed(2)}`);
    }
  }

  const finalState = engine.getState() as unknown as CounterState;
  console.log(`\nFinal count: ${FixedMath.toFloat(finalState.count).toFixed(2)}`);
  console.log(`History: ${finalState.history.map(h => FixedMath.toFloat(h).toFixed(2)).join(', ')}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCounterExample();
}
