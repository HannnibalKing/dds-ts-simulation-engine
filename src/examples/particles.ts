/**
 * Example: 2D particle simulation
 * 
 * Demonstrates vector math and physics simulation
 */

import { SimulationEngine } from '../core/engine.js';
import type { CanonicalData } from '../core/state.js';
import type { InputEvent } from '../core/input.js';
import type { StepFunction } from '../core/engine.js';
import { FixedMath, Vec2Math, FIXED_ONE } from '../math/index.js';
import type { Fixed, Vec2 } from '../math/index.js';

/**
 * Particle
 */
interface Particle {
  readonly id: number;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly mass: Fixed;
}

/**
 * Particle simulation state
 */
interface ParticleState {
  readonly particles: readonly Particle[];
  readonly gravity: Vec2;
  readonly bounds: {
    readonly width: Fixed;
    readonly height: Fixed;
  };
}

/**
 * Create initial state with some particles
 */
function createInitialState(): ParticleState {
  return {
    particles: [
      {
        id: 0,
        position: Vec2Math.create(
          FixedMath.fromInt(50),
          FixedMath.fromInt(50)
        ),
        velocity: Vec2Math.create(
          FixedMath.fromInt(2),
          FixedMath.fromInt(1)
        ),
        mass: FIXED_ONE,
      },
      {
        id: 1,
        position: Vec2Math.create(
          FixedMath.fromInt(150),
          FixedMath.fromInt(50)
        ),
        velocity: Vec2Math.create(
          FixedMath.fromInt(-1),
          FixedMath.fromInt(2)
        ),
        mass: FIXED_ONE,
      },
    ],
    gravity: Vec2Math.create(0n, FixedMath.fromFloat(0.1)),
    bounds: {
      width: FixedMath.fromInt(200),
      height: FixedMath.fromInt(200),
    },
  };
}

/**
 * Particle step function
 */
function particleStep(
  state: ParticleState,
  inputs: readonly InputEvent[]
): ParticleState {
  // Update particles
  const newParticles = state.particles.map(particle => {
    // Apply gravity
    let velocity = Vec2Math.add(particle.velocity, state.gravity);

    // Apply velocity
    let position = Vec2Math.add(particle.position, velocity);

    // Bounce off bounds
    if (position.x < 0n || position.x > state.bounds.width) {
      velocity = { x: -velocity.x, y: velocity.y };
      position = {
        x: FixedMath.clamp(position.x, 0n, state.bounds.width),
        y: position.y,
      };
    }

    if (position.y < 0n || position.y > state.bounds.height) {
      velocity = { x: velocity.x, y: -velocity.y };
      position = {
        x: position.x,
        y: FixedMath.clamp(position.y, 0n, state.bounds.height),
      };
    }

    return {
      ...particle,
      position,
      velocity,
    };
  });

  return {
    ...state,
    particles: newParticles,
  };
}

/**
 * Run particle example
 */
export function runParticleExample(): void {
  console.log('=== Particle Physics Example ===\n');

  const engine = new SimulationEngine<CanonicalData>({
    initialState: createInitialState() as unknown as CanonicalData,
    step: particleStep as unknown as StepFunction<CanonicalData>,
  });

  // Run simulation
  for (let tick = 0; tick < 100; tick++) {
    engine.executeTick();
    
    if (tick % 20 === 0) {
      const state = engine.getState() as unknown as ParticleState;
      console.log(`\nTick ${tick}:`);
      
      for (const particle of state.particles) {
        console.log(
          `  Particle ${particle.id}: ` +
          `pos=(${FixedMath.toFloat(particle.position.x).toFixed(2)}, ` +
          `${FixedMath.toFloat(particle.position.y).toFixed(2)}) ` +
          `vel=(${FixedMath.toFloat(particle.velocity.x).toFixed(2)}, ` +
          `${FixedMath.toFloat(particle.velocity.y).toFixed(2)})`
        );
      }
    }
  }

  console.log('\nSimulation complete!');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runParticleExample();
}
