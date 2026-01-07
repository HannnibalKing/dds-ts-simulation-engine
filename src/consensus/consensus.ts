/**
 * Consensus layer for distributed tick synchronization
 * 
 * Implements lockstep tick agreement:
 * - All peers agree on current tick
 * - All peers have same inputs for each tick
 * - No peer advances until all are ready
 */

import type { InputEvent } from '../core/input.js';
import type { StateHash } from '../verify/hasher.js';

/**
 * Tick readiness state
 */
export interface TickReadiness {
  readonly tick: number;
  readonly ready: boolean;
  readonly inputCount: number;
  readonly waitingForPeers: string[];
}

/**
 * Consensus message
 */
export type ConsensusMessage =
  | { type: 'ready'; tick: number; inputCount: number; hash?: number[] }
  | { type: 'advance'; tick: number }
  | { type: 'wait'; tick: number; reason: string };

/**
 * Lockstep consensus
 * 
 * All peers must signal ready before advancing to next tick
 */
export class LockstepConsensus {
  private localPeerId: string;
  private peers: Set<string> = new Set();
  private currentTick = 0;
  private peerReadiness: Map<string, Map<number, boolean>> = new Map();
  private tickAdvanceHandlers: ((tick: number) => void)[] = [];

  constructor(localPeerId: string) {
    this.localPeerId = localPeerId;
  }

  /**
   * Add peer to consensus group
   */
  addPeer(peerId: string): void {
    this.peers.add(peerId);
    this.peerReadiness.set(peerId, new Map());
  }

  /**
   * Remove peer from consensus group
   */
  removePeer(peerId: string): void {
    this.peers.delete(peerId);
    this.peerReadiness.delete(peerId);
  }

  /**
   * Signal local readiness for a tick
   */
  signalReady(tick: number, inputCount: number, hash?: StateHash): ConsensusMessage {
    if (tick < this.currentTick) {
      return {
        type: 'wait',
        tick,
        reason: 'Tick already passed',
      };
    }

    return {
      type: 'ready',
      tick,
      inputCount,
      hash: hash ? Array.from(hash) : undefined,
    };
  }

  /**
   * Receive readiness signal from peer
   */
  receivePeerReady(peerId: string, tick: number): void {
    const peerMap = this.peerReadiness.get(peerId);
    if (peerMap) {
      peerMap.set(tick, true);
    }

    // Check if all peers are ready
    if (this.areAllPeersReady(tick)) {
      this.advanceTick(tick);
    }
  }

  /**
   * Check if all peers are ready for a tick
   */
  areAllPeersReady(tick: number): boolean {
    for (const peerId of this.peers) {
      const peerMap = this.peerReadiness.get(peerId);
      if (!peerMap?.get(tick)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get tick readiness status
   */
  getTickReadiness(tick: number): TickReadiness {
    const waitingForPeers: string[] = [];

    for (const peerId of this.peers) {
      const peerMap = this.peerReadiness.get(peerId);
      if (!peerMap?.get(tick)) {
        waitingForPeers.push(peerId);
      }
    }

    return {
      tick,
      ready: waitingForPeers.length === 0,
      inputCount: 0, // TODO: track input count
      waitingForPeers,
    };
  }

  /**
   * Advance to next tick
   */
  private advanceTick(tick: number): void {
    if (tick >= this.currentTick) {
      this.currentTick = tick + 1;
      
      // Notify handlers
      for (const handler of this.tickAdvanceHandlers) {
        handler(tick);
      }

      // Clean up old readiness data
      for (const peerMap of this.peerReadiness.values()) {
        for (const [t] of peerMap) {
          if (t < tick) {
            peerMap.delete(t);
          }
        }
      }
    }
  }

  /**
   * Register tick advance handler
   */
  onTickAdvance(handler: (tick: number) => void): void {
    this.tickAdvanceHandlers.push(handler);
  }

  /**
   * Get current tick
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * Get connected peers
   */
  getPeers(): string[] {
    return Array.from(this.peers);
  }

  /**
   * Reset consensus state
   */
  reset(): void {
    this.currentTick = 0;
    this.peerReadiness.clear();
    for (const peerId of this.peers) {
      this.peerReadiness.set(peerId, new Map());
    }
  }
}

/**
 * Input agreement
 * 
 * Ensures all peers have the same inputs for each tick
 */
export class InputAgreement {
  private tickInputs: Map<number, Map<string, InputEvent[]>> = new Map();
  private peers: Set<string> = new Set();

  /**
   * Add peer
   */
  addPeer(peerId: string): void {
    this.peers.add(peerId);
  }

  /**
   * Remove peer
   */
  removePeer(peerId: string): void {
    this.peers.delete(peerId);
    for (const peerInputs of this.tickInputs.values()) {
      peerInputs.delete(peerId);
    }
  }

  /**
   * Record inputs from peer for a tick
   */
  recordPeerInputs(peerId: string, tick: number, inputs: InputEvent[]): void {
    let tickMap = this.tickInputs.get(tick);
    if (!tickMap) {
      tickMap = new Map();
      this.tickInputs.set(tick, tickMap);
    }
    tickMap.set(peerId, inputs);
  }

  /**
   * Check if all peers agree on inputs for a tick
   */
  haveInputAgreement(tick: number): boolean {
    const tickMap = this.tickInputs.get(tick);
    if (!tickMap) return false;

    for (const peerId of this.peers) {
      if (!tickMap.has(peerId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get merged inputs for a tick (from all peers)
   */
  getMergedInputs(tick: number): InputEvent[] {
    const tickMap = this.tickInputs.get(tick);
    if (!tickMap) return [];

    const allInputs: InputEvent[] = [];
    for (const inputs of tickMap.values()) {
      allInputs.push(...inputs);
    }

    // Sort by player ID for determinism
    allInputs.sort((a, b) => {
      const aPlayer = a.playerId ?? '';
      const bPlayer = b.playerId ?? '';
      return aPlayer.localeCompare(bPlayer);
    });

    return allInputs;
  }

  /**
   * Clear inputs before a tick
   */
  clearBefore(tick: number): void {
    for (const [t] of this.tickInputs) {
      if (t < tick) {
        this.tickInputs.delete(t);
      }
    }
  }

  /**
   * Get waiting peers for a tick
   */
  getWaitingPeers(tick: number): string[] {
    const tickMap = this.tickInputs.get(tick);
    const waiting: string[] = [];

    for (const peerId of this.peers) {
      if (!tickMap?.has(peerId)) {
        waiting.push(peerId);
      }
    }

    return waiting;
  }
}

/**
 * Hash verification consensus
 * 
 * Ensures all peers produce the same state hash for each tick
 */
export class HashConsensus {
  private tickHashes: Map<number, Map<string, StateHash>> = new Map();
  private peers: Set<string> = new Set();
  private divergenceHandlers: ((tick: number, peerA: string, peerB: string) => void)[] = [];

  /**
   * Add peer
   */
  addPeer(peerId: string): void {
    this.peers.add(peerId);
  }

  /**
   * Remove peer
   */
  removePeer(peerId: string): void {
    this.peers.delete(peerId);
    for (const peerHashes of this.tickHashes.values()) {
      peerHashes.delete(peerId);
    }
  }

  /**
   * Record hash from peer for a tick
   */
  recordPeerHash(peerId: string, tick: number, hash: StateHash): void {
    let tickMap = this.tickHashes.get(tick);
    if (!tickMap) {
      tickMap = new Map();
      this.tickHashes.set(tick, tickMap);
    }
    tickMap.set(peerId, hash);

    // Check for divergence
    this.checkDivergence(tick);
  }

  /**
   * Check for hash divergence among peers
   */
  private checkDivergence(tick: number): void {
    const tickMap = this.tickHashes.get(tick);
    if (!tickMap || tickMap.size < 2) return;

    const hashes = Array.from(tickMap.entries());
    const [firstPeer, firstHash] = hashes[0]!;

    for (let i = 1; i < hashes.length; i++) {
      const [peerId, hash] = hashes[i]!;
      
      if (!this.compareHashes(firstHash, hash)) {
        // DIVERGENCE DETECTED
        for (const handler of this.divergenceHandlers) {
          handler(tick, firstPeer, peerId);
        }
      }
    }
  }

  /**
   * Compare two hashes
   */
  private compareHashes(a: StateHash, b: StateHash): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Check if all peers have submitted hash for a tick
   */
  haveAllHashes(tick: number): boolean {
    const tickMap = this.tickHashes.get(tick);
    if (!tickMap) return false;

    for (const peerId of this.peers) {
      if (!tickMap.has(peerId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Register divergence handler
   */
  onDivergence(handler: (tick: number, peerA: string, peerB: string) => void): void {
    this.divergenceHandlers.push(handler);
  }

  /**
   * Clear hashes before a tick
   */
  clearBefore(tick: number): void {
    for (const [t] of this.tickHashes) {
      if (t < tick) {
        this.tickHashes.delete(t);
      }
    }
  }
}

/**
 * Deterministic leader election (simple round-robin)
 * 
 * For simulations that need a single authority
 */
export class DeterministicLeader {
  private peers: string[] = [];
  private currentTick = 0;

  /**
   * Add peer
   */
  addPeer(peerId: string): void {
    this.peers.push(peerId);
    this.peers.sort(); // Maintain deterministic order
  }

  /**
   * Remove peer
   */
  removePeer(peerId: string): void {
    this.peers = this.peers.filter(id => id !== peerId);
  }

  /**
   * Get leader for current tick
   */
  getLeader(tick: number): string | null {
    if (this.peers.length === 0) return null;
    return this.peers[tick % this.peers.length]!;
  }

  /**
   * Check if peer is leader for tick
   */
  isLeader(peerId: string, tick: number): boolean {
    return this.getLeader(tick) === peerId;
  }

  /**
   * Advance tick
   */
  advanceTick(): void {
    this.currentTick++;
  }

  /**
   * Get current tick
   */
  getCurrentTick(): number {
    return this.currentTick;
  }
}
