/**
 * Example: Distributed simulation with multiple peers
 * 
 * Demonstrates networking and consensus
 */

import { SimulationEngine } from '../core/engine.js';
import type { CanonicalData } from '../core/state.js';
import type { InputEvent } from '../core/input.js';
import type { StepFunction } from '../core/engine.js';
import { MemoryTransport, NetworkManager } from '../net/index.js';
import { LockstepConsensus } from '../consensus/index.js';
import { FixedMath, FIXED_ONE } from '../math/index.js';
import type { Fixed } from '../math/index.js';

/**
 * Shared game state
 */
interface GameState {
  readonly players: readonly {
    readonly id: string;
    readonly score: Fixed;
  }[];
}

/**
 * Create initial state
 */
function createInitialState(): GameState {
  return {
    players: [
      { id: 'player1', score: 0n },
      { id: 'player2', score: 0n },
    ],
  };
}

/**
 * Game step function
 */
function gameStep(
  state: GameState,
  inputs: readonly InputEvent[]
): GameState {
  const newPlayers = [...state.players];

  for (const input of inputs) {
    if (input.type === 'score' && input.playerId) {
      const playerIndex = newPlayers.findIndex(p => p.id === input.playerId);
      if (playerIndex >= 0) {
        const player = newPlayers[playerIndex]!;
        newPlayers[playerIndex] = {
          ...player,
          score: FixedMath.add(player.score, FIXED_ONE),
        };
      }
    }
  }

  return {
    ...state,
    players: newPlayers,
  };
}

/**
 * Run distributed example
 */
export async function runDistributedExample(): Promise<void> {
  console.log('=== Distributed Simulation Example ===\n');

  // Create two peers
  const transport1 = new MemoryTransport('peer1');
  const transport2 = new MemoryTransport('peer2');

  // Connect peers
  MemoryTransport.connectPeers(transport1, transport2);

  // Create network managers
  const net1 = new NetworkManager(transport1);
  const net2 = new NetworkManager(transport2);

  // Create consensus
  const consensus1 = new LockstepConsensus('peer1');
  const consensus2 = new LockstepConsensus('peer2');

  consensus1.addPeer('peer2');
  consensus2.addPeer('peer1');

  // Create simulation engines
  const engine1 = new SimulationEngine<CanonicalData>({
    initialState: createInitialState() as unknown as CanonicalData,
    step: gameStep as unknown as StepFunction<CanonicalData>,
  });

  const engine2 = new SimulationEngine<CanonicalData>({
    initialState: createInitialState() as unknown as CanonicalData,
    step: gameStep as unknown as StepFunction<CanonicalData>,
  });

  // Wire up input broadcasting
  net1.onInput((peerId, input) => {
    engine1.addInput(input);
  });

  net2.onInput((peerId, input) => {
    engine2.addInput(input);
  });

  // Add some inputs from different peers
  const input1: InputEvent = {
    tick: 5,
    type: 'score',
    payload: null,
    playerId: 'player1',
  };

  const input2: InputEvent = {
    tick: 10,
    type: 'score',
    payload: null,
    playerId: 'player2',
  };

  // Peer 1 broadcasts their input
  engine1.addInput(input1);
  net1.broadcastInput(input1);

  // Peer 2 broadcasts their input
  engine2.addInput(input2);
  net2.broadcastInput(input2);

  // Run simulation on both peers
  console.log('Running synchronized simulation...\n');

  for (let tick = 0; tick < 20; tick++) {
    engine1.executeTick();
    engine2.executeTick();

    if (tick % 5 === 0) {
      const state1 = engine1.getState() as unknown as GameState;
      const state2 = engine2.getState() as unknown as GameState;
      const hash1 = engine1.getCurrentHash();
      const hash2 = engine2.getCurrentHash();

      console.log(`Tick ${tick}:`);
      console.log(`  Peer1 scores: ${state1.players.map(p => 
        `${p.id}=${FixedMath.toInt(p.score)}`).join(', ')}`);
      console.log(`  Peer2 scores: ${state2.players.map(p => 
        `${p.id}=${FixedMath.toInt(p.score)}`).join(', ')}`);
      
      if (hash1 && hash2) {
        const match = hash1.every((b, i) => b === hash2[i]);
        console.log(`  Hashes match: ${match ? '✓' : '✗'}`);
      }
    }
  }

  console.log('\nDistributed simulation complete!');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDistributedExample().catch(console.error);
}
