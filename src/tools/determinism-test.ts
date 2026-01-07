/**
 * Determinism test runner
 * 
 * Verifies that simulation produces identical results across runs
 */

import { SimulationEngine } from '../core/engine.js';
import type { StepFunction } from '../core/engine.js';
import type { CanonicalData } from '../core/state.js';
import type { InputEvent } from '../core/input.js';
import { StateHasher } from '../verify/hasher.js';

/**
 * Test result
 */
export interface DeterminismTestResult {
  readonly passed: boolean;
  readonly runs: number;
  readonly ticks: number;
  readonly divergenceAt?: number;
  readonly hashes: string[][];
  readonly error?: string;
}

/**
 * Determinism test runner
 */
export class DeterminismTester {
  private hasher = new StateHasher();

  /**
   * Run simulation multiple times and verify identical results
   */
  test<TState extends CanonicalData>(
    initialState: TState,
    step: StepFunction<TState>,
    inputs: InputEvent[],
    options: {
      runs?: number;
      ticks?: number;
    } = {}
  ): DeterminismTestResult {
    const runs = options.runs ?? 10;
    const ticks = options.ticks ?? 1000;

    const allHashes: string[][] = [];

    try {
      // Run simulation multiple times
      for (let run = 0; run < runs; run++) {
        const engine = new SimulationEngine({
          initialState,
          step,
        });

        // Add all inputs
        for (const input of inputs) {
          engine.addInput(input);
        }

        const runHashes: string[] = [];

        // Execute simulation
        for (let tick = 0; tick < ticks; tick++) {
          engine.executeTick();
          const hash = engine.getCurrentHash();
          if (hash) {
            runHashes.push(this.hasher.toHex(hash));
          }
        }

        allHashes.push(runHashes);
      }

      // Compare all runs
      const firstRun = allHashes[0]!;
      for (let run = 1; run < runs; run++) {
        const currentRun = allHashes[run]!;
        
        for (let tick = 0; tick < firstRun.length; tick++) {
          if (firstRun[tick] !== currentRun[tick]) {
            return {
              passed: false,
              runs,
              ticks,
              divergenceAt: tick,
              hashes: allHashes,
              error: `Divergence at tick ${tick}: run 0 = ${firstRun[tick]}, run ${run} = ${currentRun[tick]}`,
            };
          }
        }
      }

      return {
        passed: true,
        runs,
        ticks,
        hashes: allHashes,
      };
    } catch (error) {
      return {
        passed: false,
        runs,
        ticks,
        hashes: allHashes,
        error: String(error),
      };
    }
  }

  /**
   * Test cross-platform determinism (browser vs Node.js)
   */
  testCrossPlatform<TState extends CanonicalData>(
    initialState: TState,
    step: StepFunction<TState>,
    inputs: InputEvent[],
    ticks: number = 1000
  ): string[] {
    const engine = new SimulationEngine({
      initialState,
      step,
    });

    for (const input of inputs) {
      engine.addInput(input);
    }

    const hashes: string[] = [];

    for (let tick = 0; tick < ticks; tick++) {
      engine.executeTick();
      const hash = engine.getCurrentHash();
      if (hash) {
        hashes.push(this.hasher.toHex(hash));
      }
    }

    return hashes;
  }

  /**
   * Generate determinism report
   */
  generateReport(result: DeterminismTestResult): string {
    const lines: string[] = [];
    
    lines.push('=== Determinism Test Report ===');
    lines.push(`Status: ${result.passed ? 'PASSED ✓' : 'FAILED ✗'}`);
    lines.push(`Runs: ${result.runs}`);
    lines.push(`Ticks: ${result.ticks}`);
    
    if (result.divergenceAt !== undefined) {
      lines.push(`Divergence at tick: ${result.divergenceAt}`);
    }
    
    if (result.error) {
      lines.push(`Error: ${result.error}`);
    }
    
    lines.push('');
    lines.push('Hash samples (first 5 ticks):');
    for (let run = 0; run < Math.min(3, result.runs); run++) {
      const runHashes = result.hashes[run] ?? [];
      lines.push(`  Run ${run}: ${runHashes.slice(0, 5).join(', ')}`);
    }
    
    return lines.join('\n');
  }
}
