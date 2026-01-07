/**
 * State verification and divergence detection
 * 
 * Uses BLAKE3 for cryptographic hashing of simulation state.
 * Detects when distributed nodes diverge and produces debug traces.
 */

import { blake3 } from '@noble/hashes/blake3';
import type { CanonicalData } from '../core/state.js';
import { StateSerializer } from '../core/state.js';

/**
 * State hash (32 bytes)
 */
export type StateHash = Uint8Array;

/**
 * Hash record for a specific tick
 */
export interface HashRecord {
  readonly tick: number;
  readonly hash: StateHash;
  readonly timestamp: number; // Wall-clock time (for debugging only)
}

/**
 * Divergence report
 */
export interface DivergenceReport {
  readonly tick: number;
  readonly localHash: StateHash;
  readonly remoteHash: StateHash;
  readonly localState?: CanonicalData;
  readonly remoteState?: CanonicalData;
  readonly divergencePoint?: number; // First diverging byte
}

/**
 * State hasher using BLAKE3
 */
export class StateHasher {
  private serializer = new StateSerializer();

  /**
   * Hash canonical state using BLAKE3
   * 
   * Returns 32-byte hash that is:
   * - Deterministic (same state → same hash)
   * - Cryptographically secure
   * - Fast to compute
   */
  hash(state: CanonicalData): StateHash {
    const bytes = this.serializer.serialize(state);
    return blake3(bytes);
  }

  /**
   * Compare two hashes
   */
  compare(a: StateHash, b: StateHash): boolean {
    if (a.length !== b.length) return false;
    
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    
    return true;
  }

  /**
   * Convert hash to hex string (for display/logging)
   */
  toHex(hash: StateHash): string {
    return Array.from(hash)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Parse hex string to hash
   */
  fromHex(hex: string): StateHash {
    if (hex.length !== 64) {
      throw new Error('Invalid hash hex length');
    }
    
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    
    return bytes;
  }
}

/**
 * Verification tracker
 * 
 * Records state hashes for each tick and detects divergence
 */
export class VerificationTracker {
  private hasher = new StateHasher();
  private records: Map<number, HashRecord> = new Map();
  private maxRecords: number;

  constructor(options: { maxRecords?: number } = {}) {
    this.maxRecords = options.maxRecords ?? 1000;
  }

  /**
   * Record state hash for a tick
   */
  record(tick: number, state: CanonicalData): StateHash {
    const hash = this.hasher.hash(state);
    
    this.records.set(tick, {
      tick,
      hash,
      timestamp: Date.now(),
    });

    // Prune old records
    if (this.records.size > this.maxRecords) {
      const oldestTick = Math.min(...this.records.keys());
      this.records.delete(oldestTick);
    }

    return hash;
  }

  /**
   * Verify remote hash matches local
   * 
   * Returns null if matches, DivergenceReport if diverged
   */
  verify(tick: number, remoteHash: StateHash): DivergenceReport | null {
    const localRecord = this.records.get(tick);
    if (!localRecord) {
      // We don't have this tick recorded
      return null;
    }

    if (this.hasher.compare(localRecord.hash, remoteHash)) {
      return null; // Hashes match
    }

    // DIVERGENCE DETECTED
    return {
      tick,
      localHash: localRecord.hash,
      remoteHash,
    };
  }

  /**
   * Get hash for a specific tick
   */
  getHash(tick: number): StateHash | null {
    return this.records.get(tick)?.hash ?? null;
  }

  /**
   * Get all recorded ticks
   */
  getRecordedTicks(): number[] {
    return Array.from(this.records.keys()).sort((a, b) => a - b);
  }

  /**
   * Clear records before a specific tick
   */
  clearBefore(tick: number): void {
    for (const [t] of this.records) {
      if (t < tick) {
        this.records.delete(t);
      }
    }
  }

  /**
   * Get hash hex string for display
   */
  getHashHex(tick: number): string | null {
    const hash = this.getHash(tick);
    return hash ? this.hasher.toHex(hash) : null;
  }
}

/**
 * Divergence analyzer
 * 
 * Produces detailed reports when states diverge
 */
export class DivergenceAnalyzer {
  private serializer = new StateSerializer();

  /**
   * Analyze divergence between two states
   * 
   * Finds the first differing byte in serialized form
   */
  analyze(
    tick: number,
    localState: CanonicalData,
    remoteState: CanonicalData
  ): DivergenceReport {
    const localBytes = this.serializer.serialize(localState);
    const remoteBytes = this.serializer.serialize(remoteState);

    const localHash = blake3(localBytes);
    const remoteHash = blake3(remoteBytes);

    // Find first diverging byte
    let divergencePoint: number | undefined;
    const minLength = Math.min(localBytes.length, remoteBytes.length);
    
    for (let i = 0; i < minLength; i++) {
      if (localBytes[i] !== remoteBytes[i]) {
        divergencePoint = i;
        break;
      }
    }

    if (divergencePoint === undefined && localBytes.length !== remoteBytes.length) {
      divergencePoint = minLength; // Lengths differ
    }

    return {
      tick,
      localHash,
      remoteHash,
      localState,
      remoteState,
      divergencePoint,
    };
  }

  /**
   * Generate minimal repro bundle
   * 
   * Creates JSON that can be used to reproduce divergence
   */
  generateReproBundle(report: DivergenceReport): string {
    const bundle = {
      version: '1.0',
      tick: report.tick,
      localHash: Array.from(report.localHash).map(b => b.toString(16).padStart(2, '0')).join(''),
      remoteHash: Array.from(report.remoteHash).map(b => b.toString(16).padStart(2, '0')).join(''),
      divergencePoint: report.divergencePoint,
      localState: report.localState,
      remoteState: report.remoteState,
      timestamp: new Date().toISOString(),
    };

    return JSON.stringify(bundle, null, 2);
  }

  /**
   * Find path to diverging value in object tree
   */
  findDivergingPath(
    local: CanonicalData,
    remote: CanonicalData,
    path: string[] = []
  ): string[] | null {
    // Primitives
    if (local !== remote && (
      typeof local !== 'object' || typeof remote !== 'object' ||
      local === null || remote === null
    )) {
      return path;
    }

    // Arrays
    if (Array.isArray(local) && Array.isArray(remote)) {
      if (local.length !== remote.length) {
        return [...path, `length`];
      }
      
      for (let i = 0; i < local.length; i++) {
        const result = this.findDivergingPath(local[i]!, remote[i]!, [...path, `[${i}]`]);
        if (result) return result;
      }
      
      return null;
    }

    // Objects
    if (typeof local === 'object' && typeof remote === 'object' &&
        !Array.isArray(local) && !Array.isArray(remote) &&
        local !== null && remote !== null) {
      const localKeys = Object.keys(local).sort();
      const remoteKeys = Object.keys(remote).sort();

      if (localKeys.length !== remoteKeys.length) {
        return [...path, 'keys'];
      }

      for (const key of localKeys) {
        if (!remoteKeys.includes(key)) {
          return [...path, key, '(missing)'];
        }

        const result = this.findDivergingPath(
          (local as Record<string, CanonicalData>)[key]!,
          (remote as Record<string, CanonicalData>)[key]!,
          [...path, key]
        );
        if (result) return result;
      }
    }

    return null;
  }
}
