# Getting Started with DDS-TS

## Quick Start

```bash
npm install
npm run build
```

## Run Examples

```typescript
// Counter example
node dist/examples/counter.js

// Particle physics
node dist/examples/particles.js

// Determinism test
node dist/examples/determinism-test.js

// Distributed simulation
node dist/examples/distributed.js

// Run all tests
node dist/test-all.js
```

## Your First Simulation

### 1. Create State Interface

```typescript
import type { Fixed } from 'dds-ts/math';

interface MyState {
  readonly position: { readonly x: Fixed; readonly y: Fixed };
  readonly velocity: { readonly x: Fixed; readonly y: Fixed };
  readonly score: Fixed;
}
```

### 2. Define Initial State

```typescript
import { FixedMath } from 'dds-ts/math';

function createInitialState(): MyState {
  return {
    position: { x: 0n, y: 0n },
    velocity: { x: FIXED_ONE, y: FIXED_ONE },
    score: 0n,
  };
}
```

### 3. Implement Step Function

```typescript
import type { InputEvent } from 'dds-ts/core';

function myStep(state: MyState, inputs: readonly InputEvent[]): MyState {
  let newState = state;

  // Process inputs
  for (const input of inputs) {
    switch (input.type) {
      case 'jump':
        newState = {
          ...newState,
          velocity: {
            ...newState.velocity,
            y: FixedMath.fromInt(10),
          },
        };
        break;
    }
  }

  // Update physics
  const newPos = {
    x: FixedMath.add(newState.position.x, newState.velocity.x),
    y: FixedMath.add(newState.position.y, newState.velocity.y),
  };

  return {
    ...newState,
    position: newPos,
  };
}
```

### 4. Create and Run Engine

```typescript
import { SimulationEngine } from 'dds-ts/core';

const engine = new SimulationEngine({
  initialState: createInitialState() as unknown as CanonicalData,
  step: myStep as unknown as StepFunction<CanonicalData>,
});

// Add input
engine.addInput({
  tick: 10,
  type: 'jump',
  payload: null,
});

// Run simulation
for (let i = 0; i < 100; i++) {
  engine.executeTick();
}

// Get final state
const final = engine.getState() as unknown as MyState;
console.log('Final position:', FixedMath.toFloat(final.position.x));
```

## Key Concepts

### Fixed-Point Math

**Always use FixedMath, never JavaScript Math!**

```typescript
// ✓ Correct
const a = FixedMath.fromInt(5);
const b = FixedMath.fromInt(3);
const sum = FixedMath.add(a, b);

// ✗ Wrong - non-deterministic!
const x = 5.5;
const y = Math.sqrt(x);
```

### State Immutability

All state must be readonly:

```typescript
// ✓ Correct
interface State {
  readonly value: Fixed;
  readonly items: readonly Item[];
}

// ✗ Wrong
interface State {
  value: Fixed;  // Not readonly
  items: Item[]; // Not readonly
}
```

### Pure Step Functions

```typescript
// ✓ Correct - pure function
function step(state, inputs) {
  return { ...state, value: FixedMath.add(state.value, FIXED_ONE) };
}

// ✗ Wrong - has side effects
function step(state, inputs) {
  console.log('Processing'); // Side effect!
  Date.now(); // Non-deterministic!
  return state;
}
```

## Distributed Simulation

### Setup

```typescript
import { MemoryTransport, NetworkManager } from 'dds-ts/net';
import { LockstepConsensus } from 'dds-ts/consensus';

// Create transport
const transport = new MemoryTransport('my-peer-id');
const network = new NetworkManager(transport);

// Create consensus
const consensus = new LockstepConsensus('my-peer-id');
```

### Synchronize Inputs

```typescript
// Listen for remote inputs
network.onInput((peerId, input) => {
  engine.addInput(input);
});

// Send your inputs to peers
const myInput = {
  tick: 5,
  type: 'action',
  payload: null,
  playerId: 'my-peer-id',
};

engine.addInput(myInput);
network.broadcastInput(myInput);
```

### Verify Hashes

```typescript
// Listen for remote hashes
network.onHash((peerId, tick, remoteHash) => {
  const isValid = engine.verifyHash(tick, remoteHash);
  if (!isValid) {
    console.error(`DIVERGENCE DETECTED with ${peerId} at tick ${tick}!`);
    // System will halt automatically
  }
});

// Broadcast your hash
const myHash = engine.getCurrentHash();
if (myHash) {
  network.broadcastHash(currentTick, myHash);
}
```

## Testing Determinism

Always test that your simulation is deterministic:

```typescript
import { DeterminismTester } from 'dds-ts/tools';

const tester = new DeterminismTester();

const result = tester.test(
  initialState as unknown as CanonicalData,
  stepFunction as unknown as StepFunction<CanonicalData>,
  inputs,
  {
    runs: 10,    // Run 10 times
    ticks: 1000, // For 1000 ticks each
  }
);

if (!result.passed) {
  console.error('DETERMINISM VIOLATED!');
  console.error(result.error);
  process.exit(1);
}

console.log('✓ All runs produced identical hashes');
```

## Debugging

### State Differences

```typescript
import { StateDiffer } from 'dds-ts/tools';

const differ = new StateDiffer();
const diffs = differ.diff(stateA, stateB);

console.log(differ.format(diffs));
// Output:
// ! position.x:
//   - 1234567890
//   + 1234567891
```

### Replay Viewer

```typescript
import { ReplayViewer } from 'dds-ts/tools';

const viewer = new ReplayViewer();
viewer.record(initialState, step, inputs, 1000);

// Time travel
viewer.jumpTo(500);
const frame = viewer.getCurrentFrame();
console.log('State at tick 500:', frame.state);

// Export replay
const json = viewer.export();
fs.writeFileSync('replay.json', json);
```

## Common Patterns

### Random Events (Deterministic)

```typescript
import { DeterministicRNG } from 'dds-ts/core';

interface State {
  readonly rngSeed: bigint;
  readonly value: Fixed;
}

function step(state: State, inputs): State {
  const rng = new DeterministicRNG(state.rngSeed);
  
  // Generate deterministic random value
  const randomValue = rng.next(100);
  
  return {
    value: FixedMath.fromInt(randomValue),
    rngSeed: rng.getSeed(), // Save seed for next tick
  };
}
```

### Sorted Collections

```typescript
// ✓ Correct - sorted for determinism
interface State {
  readonly entities: readonly Entity[];
}

function addEntity(state: State, entity: Entity): State {
  const newEntities = [...state.entities, entity]
    .sort((a, b) => a.id.localeCompare(b.id));
  
  return { ...state, entities: newEntities };
}
```

### Rollback on Late Input

```typescript
import { RollbackEngine } from 'dds-ts/rollback';

const rollback = new RollbackEngine({
  snapshotInterval: 100,
  maxSnapshots: 50,
});

// Create snapshots
if (rollback.maybeSnapshot(tick, state)) {
  console.log('Snapshot created');
}

// When late input arrives
const isOnTime = engine.addInput(lateInput);
if (!isOnTime) {
  const { state: restoredState, replayFromTick } = rollback.rollback(
    lateInput.tick,
    currentTick,
    stepFunction,
    allInputs,
    initialState
  );
  
  // Continue from restored state
}
```

## Best Practices

1. **Test Early**: Run determinism tests from day one
2. **Small Steps**: Keep step functions simple and focused
3. **Immutable**: Never mutate state, always return new objects
4. **No Floats**: Use FixedMath for all arithmetic
5. **Snapshot Often**: Balance memory vs rollback speed
6. **Verify Hashes**: Check peer agreement every few ticks
7. **Log Divergence**: Save repro bundles when divergence occurs

## Performance Tips

- Use snapshots to limit rollback cost
- Batch inputs when possible
- Keep state structure flat for faster serialization
- Only verify hashes on critical ticks in production

## Next Steps

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
2. Read [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed guide
3. Study examples in `src/examples/`
4. Build your simulation!
5. Test across platforms (Node.js, browser, Deno)

## Need Help?

- Check the examples in `src/examples/`
- Review the architecture docs
- Ensure you're following the determinism rules

## Remember

**If two nodes ever disagree silently, the project has failed.**

The system is designed to DETECT and HALT on divergence, not continue with incorrect state.
