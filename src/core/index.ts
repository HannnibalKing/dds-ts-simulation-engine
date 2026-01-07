/**
 * Core simulation subsystem exports
 */

export { SimulationEngine, DeterministicRNG } from './engine.js';
export type { StepFunction, SimulationConfig, SimulationStatus } from './engine.js';

export { InputBuffer, InputValidator } from './input.js';
export type { InputEvent } from './input.js';

export {
  StateSerializer,
  StateDeserializer,
  toCanonical,
} from './state.js';
export type {
  CanonicalData,
  CanonicalPrimitive,
  CanonicalArray,
  CanonicalObject,
} from './state.js';
