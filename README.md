# DDS-TS: Deterministic Distributed Simulation Engine

**Mission**: Bitwise-deterministic distributed simulation where independent nodes executing the same inputs always converge to identical state.

[![Status](https://img.shields.io/badge/status-complete-success)]() [![Build](https://img.shields.io/badge/build-passing-success)]() [![License](https://img.shields.io/badge/license-MIT-blue)]()

## Overview

DDS-TS is a TypeScript framework for building deterministic distributed simulations that guarantee:

- ✅ **Bitwise determinism** across different platforms (Node.js, browsers, edge runtimes)
- ✅ **Automatic divergence detection** with detailed debugging reports
- ✅ **Rollback & replay** for handling late inputs and time-travel debugging
- ✅ **Transport-agnostic networking** with built-in consensus protocols
- ✅ **No floating-point math** - all arithmetic uses Q32.32 fixed-point

## Quick Start

```bash
npm install
npm run build
node dist/examples/counter.js
```

## Core Invariants

### 1. Determinism
Same initial state + same ordered inputs ⇒ **identical state hash**

```typescript
const engine = new SimulationEngine({ initialState, step });
engine.run(1000); // Always produces same result
```

### 2. Time Authority
Wall-clock time is **never authoritative**; simulation advances only by logical ticks.

### 3. Pure State Transitions
```typescript
nextState = f(previousState, inputs[tick])  // Pure, no side effects
```

## Architecture

```
/dds-ts
 ├── core/          # Deterministic simulation kernel
 ├── math/          # Fixed-point & WASM math (Q32.32)
 ├── net/           # Transport-agnostic networking
 ├── consensus/     # Tick agreement & verification
 ├── rollback/      # Rewind & replay engine
 ├── verify/        # State hashing & divergence detection
 ├── tools/         # Debugging, visualization
 └── examples/      # Sample simulations
```

## Example: Simple Counter

```typescript
import { SimulationEngine, FixedMath, FIXED_ONE } from 'dds-ts';

interface State {
  count: Fixed;
}

function step(state: State, inputs: InputEvent[]): State {
  let count = state.count;
  
  for (const input of inputs) {
    if (input.type === 'increment') {
      count = FixedMath.add(count, FIXED_ONE);
    }
  }
  
  return { count };
}

const engine = new SimulationEngine({
  initialState: { count: 0n } as unknown as CanonicalData,
  step: step as unknown as StepFunction<CanonicalData>,
});

engine.addInput({ tick: 10, type: 'increment', payload: null });
engine.run(20);

console.log('Final:', FixedMath.toInt(engine.getState().count));
```

## Features

### Deterministic Math

**Never use JavaScript's Math or floating-point numbers!**

```typescript
import { FixedMath, FIXED_ONE } from 'dds-ts/math';

// ✓ Correct - deterministic
const a = FixedMath.fromInt(5);
const b = FixedMath.sin(a);

// ✗ Wrong - non-deterministic
const x = Math.sqrt(5.0);
```

### State Verification

Automatic hash verification across peers:

```typescript
const hash = engine.getCurrentHash();
network.broadcastHash(tick, hash);

// On receive
const isValid = engine.verifyHash(tick, remoteHash);
if (!isValid) {
  console.error('DIVERGENCE DETECTED!');
  // System halts automatically
}
```

### Rollback Engine

Handle late inputs with automatic rollback:

```typescript
const rollback = new RollbackEngine({ snapshotInterval: 100 });

// Late input detected
const { state } = rollback.rollback(
  targetTick,
  currentTick,
  stepFunction,
  inputs,
  initialState
);
```

### Distributed Simulation

Synchronize multiple peers:

```typescript
const transport = new MemoryTransport('peer1');
const network = new NetworkManager(transport);
const consensus = new LockstepConsensus('peer1');

// Broadcast inputs to all peers
network.broadcastInput(input);

// Verify hash agreement
network.onHash((peerId, tick, hash) => {
  engine.verifyHash(tick, hash);
});
```

## Guarantees

1. **Same simulation runs on browser, Node.js, and edge runtime**
2. **Produces identical hashes for ≥10,000 ticks**
3. **Survives packet loss + reordering**
4. **Detects and explains forced divergence**

## Testing Determinism

Always verify your simulation is deterministic:

```typescript
import { DeterminismTester } from 'dds-ts/tools';

const tester = new DeterminismTester();
const result = tester.test(initialState, step, inputs, {
  runs: 10,    // Run 10 times
  ticks: 1000  // For 1000 ticks each
});

if (!result.passed) {
  console.error('DETERMINISM VIOLATED!');
  process.exit(1);
}
```

## Documentation

- **[GETTING_STARTED.md](./GETTING_STARTED.md)** - Quick start guide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System design & architecture
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Development guide
- **[PROJECT_FILES.md](./PROJECT_FILES.md)** - File structure
- **[COMPLETION_CHECKLIST.md](./COMPLETION_CHECKLIST.md)** - Implementation status

## Examples

Run the included examples:

```bash
# Simple counter
node dist/examples/counter.js

# 2D particle physics
node dist/examples/particles.js

# Determinism verification
node dist/examples/determinism-test.js

# Distributed simulation
node dist/examples/distributed.js

# Run all tests
node dist/test-all.js
```

## Rules for AI Contributors

When continuing this project:

- ✅ **Maintain determinism at all costs**
- ✅ **Document every tradeoff**
- ✅ **Test across platforms**
- ✅ **Never silently ignore divergence**
- ❌ **Never introduce Math.random or Date.now**
- ❌ **Never use Maps/Sets without sorting**
- ❌ **Never optimize without verification**

## Definition of Done

The system is minimally complete when:

- ✅ Same simulation runs on browser, Node.js, and edge runtime
- ✅ Produces identical hashes for ≥10,000 ticks
- ✅ Survives packet loss + reordering
- ✅ Detects and explains forced divergence

**Status**: ✅ **All requirements met**

## Future Extensions (Not Yet Implemented)

- Byzantine fault tolerance
- GPU-accelerated deterministic math
- Formal verification of step functions
- Robotics / physics specialization layers

## License

MIT

## Critical Principle

> **If two nodes ever disagree silently, the project has failed.**

This implementation **detects and halts** on divergence, never continues with incorrect state.
