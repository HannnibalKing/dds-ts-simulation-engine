/**
 * Core simulation engine
 * 
 * CRITICAL: This is the heart of the deterministic system.
 * The step function MUST be pure and deterministic.
 */

import type { CanonicalData } from './state.js';
import type { InputEvent } from './input.js';
import { InputBuffer } from './input.js';
import { VerificationTracker } from '../verify/hasher.js';
import type { StateHash } from '../verify/hasher.js';

/**
 * Pure step function signature
 * 
 * RULES:
 * - Must be referentially transparent
 * - No side effects
 * - No randomness (unless seeded and passed as input)
 * - No Date, Math.random, async, IO, or system calls
 * - Same state + same inputs → same next state (always)
 */
export type StepFunction<TState extends CanonicalData = CanonicalData> = (
  state: TState,
  inputs: readonly InputEvent[]
) => TState;

/**
 * Simulation engine configuration
 */
export interface SimulationConfig<TState extends CanonicalData = CanonicalData> {
  readonly initialState: TState;
  readonly step: StepFunction<TState>;
  readonly maxRecordedHashes?: number;
  readonly onDivergence?: (tick: number, localHash: StateHash, remoteHash: StateHash) => void;
  readonly onRollback?: (fromTick: number, toTick: number) => void;
}

/**
 * Simulation status
 */
export type SimulationStatus = 
  | 'running'
  | 'paused'
  | 'halted'    // Halted due to divergence
  | 'rollback'; // Currently rolling back

/**
 * Core simulation engine
 * 
 * Implements the canonical tick loop:
 * 
 * ```
 * while (true) {
 *   const inputs = inputBuffer.consume(tick);
 *   state = step(state, inputs);
 *   hash = hashState(state);
 *   verifier.record(tick, hash);
 *   tick++;
 * }
 * ```
 */
export class SimulationEngine<TState extends CanonicalData = CanonicalData> {
  private state: TState;
  private tick: number = 0;
  private step: StepFunction<TState>;
  private inputBuffer: InputBuffer;
  private verifier: VerificationTracker;
  private status: SimulationStatus = 'paused';
  private config: SimulationConfig<TState>;

  constructor(config: SimulationConfig<TState>) {
    this.config = config;
    this.state = config.initialState;
    this.step = config.step;
    this.inputBuffer = new InputBuffer();
    this.verifier = new VerificationTracker({
      maxRecords: config.maxRecordedHashes,
    });
  }

  /**
   * Execute one simulation tick
   * 
   * This is the core deterministic loop iteration.
   */
  executeTick(): void {
    if (this.status === 'halted') {
      throw new Error('Simulation halted due to divergence');
    }

    // 1. Consume inputs for this tick
    const inputs = this.inputBuffer.consume(this.tick);

    // 2. Execute pure step function
    this.state = this.step(this.state, inputs);

    // 3. Record state hash for verification
    const hash = this.verifier.record(this.tick, this.state);

    // 4. Advance tick
    this.tick++;
  }

  /**
   * Run simulation for N ticks
   */
  run(ticks: number): void {
    this.status = 'running';
    
    for (let i = 0; i < ticks; i++) {
      if (this.status !== 'running') {
        break;
      }
      this.executeTick();
    }

    this.status = 'paused';
  }

  /**
   * Add input to the simulation
   * 
   * Returns true if input is on-time, false if late (triggers rollback)
   */
  addInput(input: InputEvent): boolean {
    const isOnTime = this.inputBuffer.add(input);
    
    if (!isOnTime && input.tick < this.tick) {
      // Late input - requires rollback
      this.config.onRollback?.(this.tick, input.tick);
      return false;
    }
    
    return true;
  }

  /**
   * Verify remote hash against local
   * 
   * Returns true if matches, false if diverged (halts simulation)
   */
  verifyHash(tick: number, remoteHash: StateHash): boolean {
    const divergence = this.verifier.verify(tick, remoteHash);
    
    if (divergence) {
      // DIVERGENCE DETECTED - HALT
      this.status = 'halted';
      this.config.onDivergence?.(
        tick,
        divergence.localHash,
        divergence.remoteHash
      );
      return false;
    }
    
    return true;
  }

  /**
   * Get current simulation state (read-only)
   */
  getState(): TState {
    return this.state;
  }

  /**
   * Get current tick
   */
  getTick(): number {
    return this.tick;
  }

  /**
   * Get state hash for a specific tick
   */
  getHash(tick: number): StateHash | null {
    return this.verifier.getHash(tick);
  }

  /**
   * Get current hash (for current tick - 1)
   */
  getCurrentHash(): StateHash | null {
    if (this.tick === 0) return null;
    return this.verifier.getHash(this.tick - 1);
  }

  /**
   * Get simulation status
   */
  getStatus(): SimulationStatus {
    return this.status;
  }

  /**
   * Pause simulation
   */
  pause(): void {
    this.status = 'paused';
  }

  /**
   * Resume simulation
   */
  resume(): void {
    if (this.status === 'halted') {
      throw new Error('Cannot resume halted simulation');
    }
    this.status = 'running';
  }

  /**
   * Halt simulation (due to divergence or error)
   */
  halt(): void {
    this.status = 'halted';
  }

  /**
   * Reset simulation to initial state
   */
  reset(): void {
    this.state = this.config.initialState;
    this.tick = 0;
    this.inputBuffer = new InputBuffer();
    this.verifier = new VerificationTracker({
      maxRecords: this.config.maxRecordedHashes,
    });
    this.status = 'paused';
  }

  /**
   * Get input buffer (for advanced usage)
   */
  getInputBuffer(): InputBuffer {
    return this.inputBuffer;
  }

  /**
   * Get verification tracker (for advanced usage)
   */
  getVerifier(): VerificationTracker {
    return this.verifier;
  }
}

/**
 * Simple deterministic RNG for testing
 * 
 * Uses Linear Congruential Generator (LCG)
 * MUST be seeded explicitly and passed as state
 */
export class DeterministicRNG {
  private seed: bigint;

  constructor(seed: bigint | number) {
    this.seed = BigInt(seed);
  }

  /**
   * Generate next random number [0, max)
   * 
   * Uses LCG: seed = (a * seed + c) mod m
   */
  next(max: number = 0x7FFFFFFF): number {
    const a = 1103515245n;
    const c = 12345n;
    const m = 2147483648n; // 2^31

    this.seed = (a * this.seed + c) % m;
    
    if (max === 0x7FFFFFFF) {
      return Number(this.seed);
    }
    
    return Number(this.seed % BigInt(max));
  }

  /**
   * Get current seed (for saving/restoring)
   */
  getSeed(): bigint {
    return this.seed;
  }

  /**
   * Set seed (for restoring)
   */
  setSeed(seed: bigint): void {
    this.seed = seed;
  }
}
