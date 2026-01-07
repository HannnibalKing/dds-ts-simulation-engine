/**
 * Rollback and replay engine
 * 
 * Enables time-travel debugging and late input handling through:
 * - Periodic state snapshots
 * - Deterministic replay from snapshots
 * - Bounded rollback depth
 */

import type { CanonicalData } from '../core/state.js';
import { StateSerializer, StateDeserializer } from '../core/state.js';
import type { InputEvent } from '../core/input.js';
import type { StepFunction } from '../core/engine.js';

/**
 * State snapshot
 */
export interface Snapshot<TState extends CanonicalData = CanonicalData> {
  readonly tick: number;
  readonly state: TState;
  readonly stateBytes?: Uint8Array; // Compressed representation
  readonly timestamp: number;       // Wall-clock time (for debugging)
}

/**
 * Rollback event
 */
export interface RollbackEvent {
  readonly fromTick: number;
  readonly toTick: number;
  readonly reason: string;
  readonly timestamp: number;
}

/**
 * Snapshot manager
 * 
 * Manages periodic snapshots with configurable interval
 */
export class SnapshotManager<TState extends CanonicalData = CanonicalData> {
  private snapshots: Map<number, Snapshot<TState>> = new Map();
  private snapshotInterval: number;
  private maxSnapshots: number;
  private serializer = new StateSerializer();
  private deserializer = new StateDeserializer(new Uint8Array());

  constructor(options: {
    snapshotInterval?: number;
    maxSnapshots?: number;
  } = {}) {
    this.snapshotInterval = options.snapshotInterval ?? 100;
    this.maxSnapshots = options.maxSnapshots ?? 50;
  }

  /**
   * Check if a snapshot should be created for this tick
   */
  shouldSnapshot(tick: number): boolean {
    return tick % this.snapshotInterval === 0;
  }

  /**
   * Create snapshot
   */
  createSnapshot(tick: number, state: TState): Snapshot<TState> {
    // Serialize state for potential compression
    const stateBytes = this.serializer.serialize(state);

    const snapshot: Snapshot<TState> = {
      tick,
      state,
      stateBytes,
      timestamp: Date.now(),
    };

    this.snapshots.set(tick, snapshot);

    // Prune old snapshots
    if (this.snapshots.size > this.maxSnapshots) {
      const oldestTick = Math.min(...this.snapshots.keys());
      this.snapshots.delete(oldestTick);
    }

    return snapshot;
  }

  /**
   * Get snapshot for a specific tick (exact match)
   */
  getSnapshot(tick: number): Snapshot<TState> | null {
    return this.snapshots.get(tick) ?? null;
  }

  /**
   * Find nearest snapshot before or at the given tick
   */
  findNearestSnapshot(tick: number): Snapshot<TState> | null {
    const ticks = Array.from(this.snapshots.keys())
      .filter(t => t <= tick)
      .sort((a, b) => b - a); // Descending order

    if (ticks.length === 0) {
      return null;
    }

    return this.snapshots.get(ticks[0]!) ?? null;
  }

  /**
   * Get all snapshot ticks
   */
  getSnapshotTicks(): number[] {
    return Array.from(this.snapshots.keys()).sort((a, b) => a - b);
  }

  /**
   * Clear snapshots before a specific tick
   */
  clearBefore(tick: number): void {
    for (const [t] of this.snapshots) {
      if (t < tick) {
        this.snapshots.delete(t);
      }
    }
  }

  /**
   * Clear all snapshots
   */
  clear(): void {
    this.snapshots.clear();
  }

  /**
   * Get snapshot interval
   */
  getSnapshotInterval(): number {
    return this.snapshotInterval;
  }

  /**
   * Set snapshot interval (affects future snapshots)
   */
  setSnapshotInterval(interval: number): void {
    if (interval < 1) {
      throw new Error('Snapshot interval must be >= 1');
    }
    this.snapshotInterval = interval;
  }
}

/**
 * Rollback engine
 * 
 * Handles rewinding and replaying simulation
 */
export class RollbackEngine<TState extends CanonicalData = CanonicalData> {
  private snapshotManager: SnapshotManager<TState>;
  private rollbackHistory: RollbackEvent[] = [];
  private maxRollbackHistory: number;

  constructor(options: {
    snapshotInterval?: number;
    maxSnapshots?: number;
    maxRollbackHistory?: number;
  } = {}) {
    this.snapshotManager = new SnapshotManager<TState>({
      snapshotInterval: options.snapshotInterval,
      maxSnapshots: options.maxSnapshots,
    });
    this.maxRollbackHistory = options.maxRollbackHistory ?? 100;
  }

  /**
   * Record snapshot if needed
   */
  maybeSnapshot(tick: number, state: TState): Snapshot<TState> | null {
    if (this.snapshotManager.shouldSnapshot(tick)) {
      return this.snapshotManager.createSnapshot(tick, state);
    }
    return null;
  }

  /**
   * Perform rollback and replay
   * 
   * Returns: [newState, replayStartTick]
   */
  rollback(
    targetTick: number,
    currentTick: number,
    step: StepFunction<TState>,
    inputs: InputEvent[],
    initialState: TState
  ): { state: TState; replayFromTick: number } {
    if (targetTick >= currentTick) {
      throw new Error('Target tick must be less than current tick');
    }

    // Record rollback event
    this.rollbackHistory.push({
      fromTick: currentTick,
      toTick: targetTick,
      reason: 'late-input',
      timestamp: Date.now(),
    });

    // Prune rollback history
    if (this.rollbackHistory.length > this.maxRollbackHistory) {
      this.rollbackHistory.shift();
    }

    // Find nearest snapshot
    const snapshot = this.snapshotManager.findNearestSnapshot(targetTick);

    let state: TState;
    let replayFromTick: number;

    if (snapshot && snapshot.tick <= targetTick) {
      // Start from snapshot
      state = snapshot.state;
      replayFromTick = snapshot.tick;
    } else {
      // No snapshot - start from initial state
      state = initialState;
      replayFromTick = 0;
    }

    // Replay from snapshot/initial to target tick
    for (let tick = replayFromTick; tick <= targetTick; tick++) {
      const tickInputs = inputs.filter(i => i.tick === tick);
      state = step(state, tickInputs);
    }

    return { state, replayFromTick };
  }

  /**
   * Get snapshot manager
   */
  getSnapshotManager(): SnapshotManager<TState> {
    return this.snapshotManager;
  }

  /**
   * Get rollback history
   */
  getRollbackHistory(): readonly RollbackEvent[] {
    return this.rollbackHistory;
  }

  /**
   * Get total number of rollbacks
   */
  getRollbackCount(): number {
    return this.rollbackHistory.length;
  }

  /**
   * Clear rollback history
   */
  clearHistory(): void {
    this.rollbackHistory = [];
  }
}

/**
 * Replay system for debugging
 * 
 * Records complete simulation history for exact reproduction
 */
export class ReplayRecorder<TState extends CanonicalData = CanonicalData> {
  private initialState: TState;
  private inputs: InputEvent[] = [];
  private isRecording = false;

  constructor(initialState: TState) {
    this.initialState = initialState;
  }

  /**
   * Start recording
   */
  start(): void {
    this.isRecording = true;
    this.inputs = [];
  }

  /**
   * Stop recording
   */
  stop(): void {
    this.isRecording = false;
  }

  /**
   * Record input
   */
  recordInput(input: InputEvent): void {
    if (this.isRecording) {
      this.inputs.push(input);
    }
  }

  /**
   * Export replay data
   */
  exportReplay(): {
    initialState: TState;
    inputs: InputEvent[];
  } {
    return {
      initialState: this.initialState,
      inputs: [...this.inputs],
    };
  }

  /**
   * Import replay data
   */
  importReplay(data: {
    initialState: TState;
    inputs: InputEvent[];
  }): void {
    this.initialState = data.initialState;
    this.inputs = [...data.inputs];
  }

  /**
   * Replay from recorded data
   */
  replay(step: StepFunction<TState>): TState {
    let state = this.initialState;
    const maxTick = Math.max(...this.inputs.map(i => i.tick), 0);

    for (let tick = 0; tick <= maxTick; tick++) {
      const tickInputs = this.inputs.filter(i => i.tick === tick);
      state = step(state, tickInputs);
    }

    return state;
  }

  /**
   * Save replay to JSON
   */
  saveToJSON(): string {
    return JSON.stringify(this.exportReplay(), null, 2);
  }

  /**
   * Load replay from JSON
   */
  loadFromJSON(json: string): void {
    const data = JSON.parse(json);
    this.importReplay(data);
  }

  /**
   * Get recorded input count
   */
  getInputCount(): number {
    return this.inputs.length;
  }

  /**
   * Clear recorded data
   */
  clear(): void {
    this.inputs = [];
  }
}
