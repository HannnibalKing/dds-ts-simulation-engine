/**
 * Input system for deterministic simulation
 * 
 * CRITICAL RULES:
 * - Inputs are immutable
 * - Inputs are indexed by tick
 * - Inputs are totally ordered
 * - Late inputs trigger rollback
 */

import type { CanonicalData } from './state.js';

/**
 * Immutable input event
 */
export interface InputEvent {
  readonly tick: number;
  readonly type: string;
  readonly payload: CanonicalData;
  readonly playerId?: string;  // Optional: for multiplayer
  readonly timestamp?: number; // Optional: wall-clock time (not authoritative)
}

/**
 * Input buffer that maintains tick ordering
 */
export class InputBuffer {
  private inputs: Map<number, InputEvent[]> = new Map();
  private currentTick = 0;

  /**
   * Add input for a specific tick
   * 
   * Returns true if input is on-time, false if late (requires rollback)
   */
  add(input: InputEvent): boolean {
    const isLate = input.tick < this.currentTick;
    
    const tickInputs = this.inputs.get(input.tick) ?? [];
    tickInputs.push(input);
    
    // Sort by player ID for determinism (if multiple inputs per tick)
    tickInputs.sort((a, b) => {
      const aPlayer = a.playerId ?? '';
      const bPlayer = b.playerId ?? '';
      return aPlayer.localeCompare(bPlayer);
    });
    
    this.inputs.set(input.tick, tickInputs);
    
    return !isLate;
  }

  /**
   * Consume inputs for current tick and advance
   * 
   * Returns empty array if no inputs for this tick.
   */
  consume(tick: number): readonly InputEvent[] {
    this.currentTick = tick;
    const inputs = this.inputs.get(tick) ?? [];
    return inputs;
  }

  /**
   * Peek at inputs for a specific tick without consuming
   */
  peek(tick: number): readonly InputEvent[] {
    return this.inputs.get(tick) ?? [];
  }

  /**
   * Get the earliest tick with pending inputs
   */
  getEarliestPendingTick(): number | null {
    const ticks = Array.from(this.inputs.keys()).sort((a, b) => a - b);
    return ticks.find(t => t >= this.currentTick) ?? null;
  }

  /**
   * Clear inputs before a specific tick (used after snapshot)
   */
  clearBefore(tick: number): void {
    for (const [t] of this.inputs) {
      if (t < tick) {
        this.inputs.delete(t);
      }
    }
  }

  /**
   * Get all inputs from startTick to endTick (inclusive)
   * Used for rollback replay
   */
  getRange(startTick: number, endTick: number): InputEvent[] {
    const result: InputEvent[] = [];
    
    for (let tick = startTick; tick <= endTick; tick++) {
      const inputs = this.inputs.get(tick) ?? [];
      result.push(...inputs);
    }
    
    return result;
  }

  /**
   * Check if there are any late inputs (older than current tick)
   */
  hasLateInputs(): boolean {
    for (const tick of this.inputs.keys()) {
      if (tick < this.currentTick) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the current tick
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * Reset to a specific tick (used for rollback)
   */
  resetToTick(tick: number): void {
    this.currentTick = tick;
  }
}

/**
 * Input validator
 * 
 * Ensures inputs conform to schema and security rules
 */
export class InputValidator {
  private maxPayloadSize: number;
  private allowedTypes: Set<string>;

  constructor(options: {
    maxPayloadSize?: number;
    allowedTypes?: string[];
  } = {}) {
    this.maxPayloadSize = options.maxPayloadSize ?? 1024 * 10; // 10KB default
    this.allowedTypes = new Set(options.allowedTypes ?? []);
  }

  /**
   * Validate input before adding to buffer
   */
  validate(input: InputEvent): { valid: boolean; error?: string } {
    // Check tick is non-negative
    if (input.tick < 0) {
      return { valid: false, error: 'Tick must be non-negative' };
    }

    // Check type is allowed
    if (this.allowedTypes.size > 0 && !this.allowedTypes.has(input.type)) {
      return { valid: false, error: `Input type '${input.type}' not allowed` };
    }

    // Check payload size (rough estimate)
    const payloadStr = JSON.stringify(input.payload);
    if (payloadStr.length > this.maxPayloadSize) {
      return { valid: false, error: 'Payload too large' };
    }

    return { valid: true };
  }

  /**
   * Add allowed input type
   */
  allowType(type: string): void {
    this.allowedTypes.add(type);
  }
}
