/**
 * Transport-agnostic networking layer
 * 
 * CRITICAL: Networking must NEVER affect simulation order.
 * All inputs must go through the input buffer and consensus layer.
 */

import type { InputEvent } from '../core/input.js';
import type { StateHash } from '../verify/hasher.js';

/**
 * Network message types
 */
export type NetworkMessage =
  | { type: 'input'; input: InputEvent }
  | { type: 'hash'; tick: number; hash: number[] }
  | { type: 'sync-request'; fromTick: number; toTick: number }
  | { type: 'sync-response'; tick: number; state: unknown }
  | { type: 'ping'; timestamp: number }
  | { type: 'pong'; timestamp: number };

/**
 * Peer connection state
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

/**
 * Peer info
 */
export interface PeerInfo {
  readonly id: string;
  readonly state: ConnectionState;
  readonly connectedAt?: number;
  readonly lastMessageAt?: number;
  readonly latency?: number; // Estimated RTT in ms
}

/**
 * Transport interface
 * 
 * All transports must implement this interface
 */
export interface Transport {
  /**
   * Connect to a peer
   */
  connect(address: string): Promise<void>;

  /**
   * Disconnect from peer
   */
  disconnect(peerId: string): void;

  /**
   * Send message to peer
   */
  send(peerId: string, message: NetworkMessage): void;

  /**
   * Broadcast message to all peers
   */
  broadcast(message: NetworkMessage): void;

  /**
   * Set message handler
   */
  onMessage(handler: (peerId: string, message: NetworkMessage) => void): void;

  /**
   * Set connection handler
   */
  onConnect(handler: (peerId: string) => void): void;

  /**
   * Set disconnection handler
   */
  onDisconnect(handler: (peerId: string) => void): void;

  /**
   * Get connected peers
   */
  getPeers(): PeerInfo[];

  /**
   * Get local peer ID
   */
  getLocalId(): string;
}

/**
 * In-memory transport for testing
 */
export class MemoryTransport implements Transport {
  private localId: string;
  private peers: Map<string, MemoryTransport> = new Map();
  private messageHandler?: (peerId: string, message: NetworkMessage) => void;
  private connectHandler?: (peerId: string) => void;
  private disconnectHandler?: (peerId: string) => void;

  constructor(id: string) {
    this.localId = id;
  }

  async connect(peerId: string): Promise<void> {
    // In-memory transport doesn't need async connect
  }

  disconnect(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      this.peers.delete(peerId);
      peer.peers.delete(this.localId);
      this.disconnectHandler?.(peerId);
      peer.disconnectHandler?.(this.localId);
    }
  }

  send(peerId: string, message: NetworkMessage): void {
    const peer = this.peers.get(peerId);
    if (peer?.messageHandler) {
      // Simulate async delivery
      setTimeout(() => {
        peer.messageHandler?.(this.localId, message);
      }, 0);
    }
  }

  broadcast(message: NetworkMessage): void {
    for (const peerId of this.peers.keys()) {
      this.send(peerId, message);
    }
  }

  onMessage(handler: (peerId: string, message: NetworkMessage) => void): void {
    this.messageHandler = handler;
  }

  onConnect(handler: (peerId: string) => void): void {
    this.connectHandler = handler;
  }

  onDisconnect(handler: (peerId: string) => void): void {
    this.disconnectHandler = handler;
  }

  getPeers(): PeerInfo[] {
    return Array.from(this.peers.keys()).map(id => ({
      id,
      state: 'connected' as const,
    }));
  }

  getLocalId(): string {
    return this.localId;
  }

  /**
   * Manually connect two memory transports (for testing)
   */
  static connectPeers(a: MemoryTransport, b: MemoryTransport): void {
    a.peers.set(b.localId, b);
    b.peers.set(a.localId, a);
    a.connectHandler?.(b.localId);
    b.connectHandler?.(a.localId);
  }
}

/**
 * WebSocket transport (Node.js & Browser)
 */
export class WebSocketTransport implements Transport {
  private localId: string;
  private peers: Map<string, WebSocket> = new Map();
  private peerInfo: Map<string, PeerInfo> = new Map();
  private messageHandler?: (peerId: string, message: NetworkMessage) => void;
  private connectHandler?: (peerId: string) => void;
  private disconnectHandler?: (peerId: string) => void;
  private server?: unknown; // WebSocket.Server in Node.js

  constructor(id: string) {
    this.localId = id;
  }

  async connect(address: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(address);

      ws.onopen = () => {
        // Exchange peer IDs
        ws.send(JSON.stringify({ type: 'handshake', peerId: this.localId }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data as string);

        if (data.type === 'handshake') {
          const peerId = data.peerId;
          this.peers.set(peerId, ws);
          this.peerInfo.set(peerId, {
            id: peerId,
            state: 'connected',
            connectedAt: Date.now(),
          });
          this.connectHandler?.(peerId);
          resolve();
        } else {
          const peerId = this.findPeerIdBySocket(ws);
          if (peerId) {
            this.messageHandler?.(peerId, data as NetworkMessage);
          }
        }
      };

      ws.onerror = (error) => {
        reject(error);
      };

      ws.onclose = () => {
        const peerId = this.findPeerIdBySocket(ws);
        if (peerId) {
          this.peers.delete(peerId);
          this.peerInfo.delete(peerId);
          this.disconnectHandler?.(peerId);
        }
      };
    });
  }

  disconnect(peerId: string): void {
    const ws = this.peers.get(peerId);
    if (ws) {
      ws.close();
      this.peers.delete(peerId);
      this.peerInfo.delete(peerId);
    }
  }

  send(peerId: string, message: NetworkMessage): void {
    const ws = this.peers.get(peerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcast(message: NetworkMessage): void {
    const data = JSON.stringify(message);
    for (const ws of this.peers.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  onMessage(handler: (peerId: string, message: NetworkMessage) => void): void {
    this.messageHandler = handler;
  }

  onConnect(handler: (peerId: string) => void): void {
    this.connectHandler = handler;
  }

  onDisconnect(handler: (peerId: string) => void): void {
    this.disconnectHandler = handler;
  }

  getPeers(): PeerInfo[] {
    return Array.from(this.peerInfo.values());
  }

  getLocalId(): string {
    return this.localId;
  }

  private findPeerIdBySocket(ws: WebSocket): string | null {
    for (const [peerId, socket] of this.peers) {
      if (socket === ws) {
        return peerId;
      }
    }
    return null;
  }
}

/**
 * Network manager
 * 
 * Coordinates message passing between peers
 */
export class NetworkManager {
  private transport: Transport;
  private inputHandlers: ((peerId: string, input: InputEvent) => void)[] = [];
  private hashHandlers: ((peerId: string, tick: number, hash: StateHash) => void)[] = [];

  constructor(transport: Transport) {
    this.transport = transport;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.transport.onMessage((peerId, message) => {
      switch (message.type) {
        case 'input':
          for (const handler of this.inputHandlers) {
            handler(peerId, message.input);
          }
          break;

        case 'hash':
          const hash = new Uint8Array(message.hash);
          for (const handler of this.hashHandlers) {
            handler(peerId, message.tick, hash);
          }
          break;

        case 'ping':
          this.transport.send(peerId, {
            type: 'pong',
            timestamp: message.timestamp,
          });
          break;

        case 'pong':
          // Calculate latency
          const latency = Date.now() - message.timestamp;
          // Update peer info (implementation depends on transport)
          break;
      }
    });
  }

  /**
   * Send input to all peers
   */
  broadcastInput(input: InputEvent): void {
    this.transport.broadcast({ type: 'input', input });
  }

  /**
   * Send hash to all peers
   */
  broadcastHash(tick: number, hash: StateHash): void {
    this.transport.broadcast({
      type: 'hash',
      tick,
      hash: Array.from(hash),
    });
  }

  /**
   * Send hash to specific peer
   */
  sendHash(peerId: string, tick: number, hash: StateHash): void {
    this.transport.send(peerId, {
      type: 'hash',
      tick,
      hash: Array.from(hash),
    });
  }

  /**
   * Register input handler
   */
  onInput(handler: (peerId: string, input: InputEvent) => void): void {
    this.inputHandlers.push(handler);
  }

  /**
   * Register hash handler
   */
  onHash(handler: (peerId: string, tick: number, hash: StateHash) => void): void {
    this.hashHandlers.push(handler);
  }

  /**
   * Measure latency to peer
   */
  measureLatency(peerId: string): void {
    this.transport.send(peerId, {
      type: 'ping',
      timestamp: Date.now(),
    });
  }

  /**
   * Get transport
   */
  getTransport(): Transport {
    return this.transport;
  }

  /**
   * Get connected peers
   */
  getPeers(): PeerInfo[] {
    return this.transport.getPeers();
  }
}
