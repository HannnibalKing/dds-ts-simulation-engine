# DDS-TS Architecture

## System Overview

DDS-TS is a **deterministic distributed simulation engine** that guarantees bitwise-identical results across different platforms, hardware, and network conditions.

## Core Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│  (Your game/simulation using DDS-TS as a library)       │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│                  Simulation Engine                       │
│  ┌────────────────────────────────────────────────┐    │
│  │  Tick Loop:                                     │    │
│  │    inputs = consume(tick)                       │    │
│  │    state = step(state, inputs)                  │    │
│  │    hash = verify(state)                         │    │
│  │    tick++                                       │    │
│  └────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼─────┐ ┌─────▼────────┐
│   Input      │ │  State   │ │ Verification │
│   Buffer     │ │  Manager │ │   System     │
└──────────────┘ └──────────┘ └──────────────┘
        │              │              │
        │         ┌────▼────┐         │
        │         │  Math   │         │
        │         │ Library │         │
        │         └─────────┘         │
        │                             │
┌───────▼─────────────────────────────▼─────┐
│          Rollback Engine                   │
│  (Snapshots + Replay)                      │
└────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │                       │
┌───────▼──────┐      ┌─────────▼────────┐
│   Network    │      │    Consensus     │
│   Layer      │◄────►│     System       │
└──────────────┘      └──────────────────┘
```

## Layer Responsibilities

### 1. Math Layer (`/math`)

**Purpose**: Provide deterministic arithmetic

**Guarantees**:
- Same inputs → same outputs (always)
- Bitwise-identical results across platforms
- No floating-point arithmetic

**Components**:
- `FixedMath`: Q32.32 fixed-point operations
- `Vec2Math`/`Vec3Math`: Vector operations
- Trigonometric functions (sin, cos, atan2)

**Example**:
```typescript
const a = FixedMath.fromInt(5);
const b = FixedMath.fromInt(3);
const sum = FixedMath.add(a, b); // Always 8.0
```

### 2. Core Layer (`/core`)

**Purpose**: Simulation execution engine

**Components**:

#### a) State Manager (`state.ts`)
- Canonical serialization
- No Maps/Sets (unordered)
- Deterministic byte encoding
- Supports bigint, strings, arrays, objects

#### b) Input Buffer (`input.ts`)
- Tick-indexed storage
- Total ordering guarantee
- Late input detection
- Input validation

#### c) Engine (`engine.ts`)
- Main tick loop
- Pure step function execution
- Hash recording
- Status management

**Data Flow**:
```
InputEvent → InputBuffer → Step Function → New State → Hash
```

### 3. Verification Layer (`/verify`)

**Purpose**: Detect divergence

**Components**:
- `StateHasher`: BLAKE3-based hashing
- `VerificationTracker`: Hash history
- `DivergenceAnalyzer`: Debug reports

**How it works**:
1. After each tick, hash the state
2. Store hash with tick number
3. When receiving remote hash, compare
4. If mismatch → HALT and report

### 4. Rollback Layer (`/rollback`)

**Purpose**: Handle late inputs and time-travel

**Components**:

#### a) Snapshot Manager
- Periodic state snapshots
- Configurable interval (default: every 100 ticks)
- LRU eviction

#### b) Rollback Engine
- Find nearest snapshot
- Replay from snapshot to target tick
- Re-verify hashes

**Rollback Flow**:
```
1. Late input arrives at tick 500
2. Current tick is 1000
3. Find snapshot at tick 400
4. Restore state from tick 400
5. Re-apply inputs 400→500
6. Continue from tick 500
```

### 5. Network Layer (`/net`)

**Purpose**: Transport-agnostic communication

**Design Principle**: 
> Networking NEVER affects simulation order

**Transports**:
- `MemoryTransport`: In-process testing
- `WebSocketTransport`: TCP-based networking
- (Future: WebRTC, QUIC)

**Message Types**:
- `input`: Share inputs
- `hash`: Share state hashes
- `sync-request`/`sync-response`: State sync
- `ping`/`pong`: Latency measurement

### 6. Consensus Layer (`/consensus`)

**Purpose**: Distributed tick agreement

**Models**:

#### a) Lockstep Consensus
- All peers must be ready before advancing
- No peer runs ahead
- Simple but requires synchronization

#### b) Input Agreement
- Ensure all peers have same inputs per tick
- Merge inputs from multiple sources
- Deterministic sorting by player ID

#### c) Hash Consensus
- All peers verify identical hashes
- Detect divergence immediately
- Trigger halt on mismatch

#### d) Deterministic Leader
- Round-robin leadership
- Same leader calculation on all peers
- For authority-based simulations

### 7. Tools Layer (`/tools`)

**Purpose**: Debugging and verification

**Tools**:

#### a) Determinism Tester
```typescript
const result = tester.test(state, step, inputs, {
  runs: 10,
  ticks: 1000
});
// Verifies identical hashes across runs
```

#### b) State Differ
```typescript
const diffs = differ.diff(stateA, stateB);
// Finds exact divergence point
```

#### c) Replay Viewer
```typescript
viewer.record(state, step, inputs, 1000);
viewer.jumpTo(500);
const frame = viewer.getCurrentFrame();
// Time-travel debugging
```

## Determinism Guarantees

### What IS deterministic:

✅ Fixed-point math operations  
✅ Sorted arrays  
✅ Object key iteration (sorted)  
✅ Seeded RNG (DeterministicRNG)  
✅ State serialization  
✅ Hash computation  

### What is NOT deterministic:

❌ JavaScript Math functions  
❌ Floating-point arithmetic  
❌ Date.now() / timestamps  
❌ Math.random()  
❌ Maps/Sets (iteration order)  
❌ Async operations  
❌ Network timing  

## State Lifecycle

```
┌──────────────┐
│ Initial State│
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  Consume Inputs  │◄───── InputBuffer
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Execute Step Fn  │ (Pure, Deterministic)
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│   Hash State     │◄───── VerificationTracker
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Maybe Snapshot   │◄───── SnapshotManager
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│   Advance Tick   │
└──────┬───────────┘
       │
       └─────► (Repeat)
```

## Divergence Detection

```
Peer A                    Peer B
  │                         │
  ├─ tick 100               ├─ tick 100
  ├─ hash: 0xABCD...        ├─ hash: 0xABCD... ✓ Match
  │                         │
  ├─ tick 101               ├─ tick 101
  ├─ hash: 0x1234...        ├─ hash: 0x5678... ✗ DIVERGENCE!
  │                         │
  └─► HALT                  └─► HALT
  │                         │
  ├─ Generate repro         ├─ Generate repro
  └─ Save state dump        └─ Save state dump
```

## Input Timing

```
Timeline:
  tick:     0   1   2   3   4   5   6   7   8   9
  current:              ▲
  
Late input arrives:
  tick:     0   1   2  [3]  4   5   6   7   8   9
  current:              ▲   (input for tick 3)
  
Rollback required:
  1. Save current tick: 9
  2. Find snapshot: tick 0
  3. Restore snapshot
  4. Replay ticks 0→3 with new input
  5. Continue from tick 3
```

## Performance Characteristics

| Operation | Time Complexity | Notes |
|-----------|----------------|-------|
| Step execution | O(n) | n = state size |
| Hash computation | O(n) | n = serialized bytes |
| Snapshot creation | O(n) | Full state copy |
| Rollback | O(k×n) | k = ticks to replay |
| Input lookup | O(1) | Hash map indexed by tick |
| Consensus check | O(p) | p = peer count |

## Memory Usage

- **State**: 1× per tick (garbage collected)
- **Snapshots**: ~50 snapshots × state size
- **Input buffer**: All inputs until snapshot
- **Hash history**: 1000 hashes × 32 bytes = 32KB

## Deployment Targets

### Supported Platforms:
- ✅ Node.js 20+
- ✅ Modern browsers (Chrome, Firefox, Safari)
- ✅ Deno
- ✅ Bun
- ✅ Edge runtimes (Cloudflare Workers, etc.)

### Not Supported:
- ❌ Platforms without BigInt support
- ❌ Environments with restricted WebAssembly (if using WASM math)

## Failure Modes

### 1. Divergence Detected
**Cause**: Step function is non-deterministic  
**Effect**: Simulation halts  
**Recovery**: Fix step function, replay from snapshot

### 2. Late Input
**Cause**: Network delay  
**Effect**: Rollback triggered  
**Recovery**: Automatic replay from snapshot

### 3. Missing Snapshot
**Cause**: Rollback depth exceeds snapshots  
**Effect**: Replay from initial state (expensive)  
**Recovery**: Reduce snapshot interval

### 4. Hash Mismatch
**Cause**: Different platform behavior  
**Effect**: Divergence detected  
**Recovery**: Use repro bundle to debug

## Security Considerations

- **Input validation**: Prevents malicious inputs
- **Hash verification**: Detects tampering
- **Bounded rollback**: Prevents DoS via late inputs
- **No Byzantine tolerance**: v1 assumes honest peers

## Future Extensions (Not Yet Implemented)

- Byzantine fault tolerance
- GPU-accelerated deterministic math (WASM SIMD)
- Formal verification of step functions
- Delta-compressed snapshots
- State migration tools
- WebRTC transport
- QUIC transport

## Summary

DDS-TS achieves determinism through:

1. **Fixed-point math** - No floating-point
2. **Canonical serialization** - Stable ordering
3. **Pure functions** - No side effects
4. **Verification** - Continuous hash checks
5. **Rollback** - Late input handling
6. **Consensus** - Peer agreement

If any component violates these principles, determinism breaks. The system is designed to **detect and halt** rather than continue with divergence.

**Remember**: If two nodes ever disagree silently, the project has failed.
