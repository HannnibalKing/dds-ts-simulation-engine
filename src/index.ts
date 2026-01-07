/**
 * Main entry point and examples
 */

export * from './core/index.js';
export * from './math/index.js';
export * from './net/index.js';
export * from './consensus/index.js';
export * from './rollback/index.js';
export * from './verify/index.js';
export * from './tools/index.js';

// Re-export commonly used types
export type {
  CanonicalData,
  CanonicalPrimitive,
  CanonicalArray,
  CanonicalObject,
} from './core/state.js';

export type {
  Fixed,
  Vec2,
  Vec3,
} from './math/index.js';

export type {
  InputEvent,
} from './core/input.js';

export type {
  StepFunction,
  SimulationConfig,
  SimulationStatus,
} from './core/engine.js';

export type {
  StateHash,
  HashRecord,
  DivergenceReport,
} from './verify/hasher.js';

export type {
  Snapshot,
  RollbackEvent,
} from './rollback/rollback.js';

export type {
  Transport,
  NetworkMessage,
  PeerInfo,
} from './net/transport.js';
