# DDS-TS Development Guide

## Project Structure

```
/dds-ts
 ├── src/
 │   ├── core/          # Simulation kernel
 │   │   ├── engine.ts  # Main tick loop
 │   │   ├── input.ts   # Input buffer
 │   │   └── state.ts   # State serialization
 │   │
 │   ├── math/          # Deterministic math
 │   │   ├── fixed.ts   # Fixed-point Q32.32
 │   │   └── vector.ts  # Vector operations
 │   │
 │   ├── verify/        # Verification system
 │   │   └── hasher.ts  # BLAKE3 hashing
 │   │
 │   ├── rollback/      # Time travel
 │   │   └── rollback.ts # Snapshots & replay
 │   │
 │   ├── net/           # Networking
 │   │   └── transport.ts # Transport layer
 │   │
 │   ├── consensus/     # Distributed agreement
 │   │   └── consensus.ts # Lockstep consensus
 │   │
 │   ├── tools/         # Debugging tools
 │   │   ├── determinism-test.ts
 │   │   ├── differ.ts
 │   │   └── replay-viewer.ts
 │   │
 │   └── examples/      # Sample simulations
 │       ├── counter.ts
 │       ├── particles.ts
 │       ├── distributed.ts
 │       └── determinism-test.ts
 │
 ├── package.json
 ├── tsconfig.json
 └── README.md
```

## Core Concepts

### 1. Deterministic Math

**NEVER use JavaScript's Math or floating-point numbers in simulation logic.**

```typescript
import { FixedMath, FIXED_ONE } from 'dds-ts/math';

// ✓ Correct
const a = FixedMath.fromInt(5);
const b = FixedMath.fromInt(3);
const sum = FixedMath.add(a, b);

// ✗ Wrong (non-deterministic)
const x = 5.0;
const y = Math.sqrt(x);
```

### 2. Pure Step Functions

Step functions must be **pure** and **deterministic**:

```typescript
function step(state: MyState, inputs: InputEvent[]): MyState {
  // ✓ Pure computation
  let newValue = FixedMath.add(state.value, FIXED_ONE);
  
  // ✗ Side effects forbidden
  console.log('Processing...'); // NO
  Date.now(); // NO
  Math.random(); // NO
  fetch('...'); // NO
  
  return { ...state, value: newValue };
}
```

### 3. Canonical State

State must be **serializable** and **ordered**:

```typescript
// ✓ Correct state
interface GoodState {
  readonly value: Fixed;
  readonly items: readonly Item[]; // Arrays are OK
  readonly config: { readonly key: string }; // Objects are OK
}

// ✗ Forbidden state
interface BadState {
  value: number; // Mutable (should be readonly)
  items: Map<string, Item>; // Unordered structure
  timestamp: Date; // Non-canonical type
}
```

### 4. Input System

All external events must go through inputs:

```typescript
const input: InputEvent = {
  tick: 10,           // When to apply
  type: 'move',       // Input type
  payload: { x: 5n }, // Canonical data
  playerId: 'p1',     // Optional player ID
};

engine.addInput(input);
```

## Creating a Simulation

### Step 1: Define State

```typescript
interface MyState extends CanonicalData {
  readonly entities: readonly Entity[];
  readonly score: Fixed;
}
```

### Step 2: Create Step Function

```typescript
function myStep(state: MyState, inputs: InputEvent[]): MyState {
  // Process inputs
  let newState = state;
  
  for (const input of inputs) {
    switch (input.type) {
      case 'action':
        newState = handleAction(newState, input);
        break;
    }
  }
  
  // Update logic
  newState = updateEntities(newState);
  
  return newState;
}
```

### Step 3: Create Engine

```typescript
const engine = new SimulationEngine({
  initialState: createInitialState(),
  step: myStep,
});
```

### Step 4: Run

```typescript
// Add inputs
engine.addInput({ tick: 0, type: 'start', payload: null });

// Execute
for (let i = 0; i < 1000; i++) {
  engine.executeTick();
}

// Get result
const finalState = engine.getState();
```

## Testing Determinism

Always test that your simulation is deterministic:

```typescript
import { DeterminismTester } from 'dds-ts/tools';

const tester = new DeterminismTester();
const result = tester.test(initialState, stepFunction, inputs, {
  runs: 10,
  ticks: 1000,
});

if (!result.passed) {
  console.error('DETERMINISM VIOLATED!');
  console.error(result.error);
}
```

## Distributed Simulation

### Setup Network

```typescript
import { MemoryTransport, NetworkManager } from 'dds-ts/net';
import { LockstepConsensus } from 'dds-ts/consensus';

const transport = new MemoryTransport('peer1');
const network = new NetworkManager(transport);
const consensus = new LockstepConsensus('peer1');
```

### Broadcast Inputs

```typescript
network.onInput((peerId, input) => {
  engine.addInput(input);
});

// Send input to all peers
const myInput = { tick: 5, type: 'action', payload: null };
engine.addInput(myInput);
network.broadcastInput(myInput);
```

### Verify Hashes

```typescript
network.onHash((peerId, tick, remoteHash) => {
  const isValid = engine.verifyHash(tick, remoteHash);
  if (!isValid) {
    console.error(`DIVERGENCE with ${peerId} at tick ${tick}`);
  }
});
```

## Rollback & Replay

Enable rollback for late inputs:

```typescript
import { RollbackEngine } from 'dds-ts/rollback';

const rollback = new RollbackEngine({
  snapshotInterval: 100, // Snapshot every 100 ticks
  maxSnapshots: 50,
});

// Create snapshot
if (rollback.maybeSnapshot(tick, state)) {
  console.log('Snapshot created');
}

// Rollback when needed
const { state: restoredState } = rollback.rollback(
  targetTick,
  currentTick,
  stepFunction,
  inputs,
  initialState
);
```

## Common Pitfalls

### ❌ Using Floating-Point Math

```typescript
// WRONG
const x = 5.5;
const y = x * 2.0;
```

```typescript
// CORRECT
const x = FixedMath.fromFloat(5.5);
const y = FixedMath.mul(x, FixedMath.fromInt(2));
```

### ❌ Unordered Collections

```typescript
// WRONG
const state = {
  items: new Map<string, Item>(),
};
```

```typescript
// CORRECT
const state = {
  items: [{ id: 'a', ...}, { id: 'b', ...}].sort((a, b) => 
    a.id.localeCompare(b.id)
  ),
};
```

### ❌ Side Effects in Step

```typescript
// WRONG
function step(state, inputs) {
  console.log('tick'); // Side effect!
  return state;
}
```

```typescript
// CORRECT
function step(state, inputs) {
  return state; // Pure function
}
```

## Performance Tips

1. **Snapshot interval**: Balance between rollback speed and memory
2. **Input batching**: Group multiple inputs per tick when possible
3. **State structure**: Flat structures serialize faster
4. **Hash verification**: Only verify critical ticks in production

## Debugging

### View State Differences

```typescript
import { StateDiffer } from 'dds-ts/tools';

const differ = new StateDiffer();
const diffs = differ.diff(stateA, stateB);
console.log(differ.format(diffs));
```

### Replay Viewer

```typescript
import { ReplayViewer } from 'dds-ts/tools';

const viewer = new ReplayViewer();
viewer.record(initialState, step, inputs, 1000);

// Navigate
viewer.jumpTo(500);
const frame = viewer.getCurrentFrame();
console.log(frame.state);
```

### Generate Repro Bundle

When divergence is detected:

```typescript
import { DivergenceAnalyzer } from 'dds-ts/verify';

const analyzer = new DivergenceAnalyzer();
const report = analyzer.analyze(tick, localState, remoteState);
const bundle = analyzer.generateReproBundle(report);

// Save to file for debugging
fs.writeFileSync('divergence-report.json', bundle);
```

## Next Steps

1. Study the examples in `src/examples/`
2. Build your own simulation
3. Test determinism rigorously
4. Deploy across platforms (browser, Node.js, edge)
5. Monitor for divergence in production

## Rules for AI Agents

When continuing this project:

- ✓ Maintain determinism at all costs
- ✓ Document every tradeoff
- ✓ Test across platforms
- ✓ Never silently ignore divergence
- ✗ Never introduce Math.random or Date.now
- ✗ Never use Maps/Sets without sorting
- ✗ Never optimize without verification
