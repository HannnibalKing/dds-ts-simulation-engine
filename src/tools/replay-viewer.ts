/**
 * Replay viewer for debugging
 */

import type { CanonicalData } from '../core/state.js';
import type { InputEvent } from '../core/input.js';
import type { StepFunction } from '../core/engine.js';
import { SimulationEngine } from '../core/engine.js';

/**
 * Frame in replay
 */
export interface ReplayFrame<TState extends CanonicalData = CanonicalData> {
  readonly tick: number;
  readonly state: TState;
  readonly inputs: readonly InputEvent[];
  readonly hash: string;
}

/**
 * Replay viewer
 */
export class ReplayViewer<TState extends CanonicalData = CanonicalData> {
  private frames: ReplayFrame<TState>[] = [];
  private currentFrame = 0;

  /**
   * Record simulation run
   */
  record(
    initialState: TState,
    step: StepFunction<TState>,
    inputs: InputEvent[],
    ticks: number
  ): void {
    const engine = new SimulationEngine({
      initialState,
      step,
    });

    for (const input of inputs) {
      engine.addInput(input);
    }

    this.frames = [];

    for (let tick = 0; tick < ticks; tick++) {
      const tickInputs = inputs.filter(i => i.tick === tick);
      
      engine.executeTick();
      
      const state = engine.getState();
      const hash = engine.getCurrentHash();

      this.frames.push({
        tick,
        state,
        inputs: tickInputs,
        hash: hash ? Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('') : '',
      });
    }
  }

  /**
   * Get frame by tick
   */
  getFrame(tick: number): ReplayFrame<TState> | null {
    return this.frames[tick] ?? null;
  }

  /**
   * Get current frame
   */
  getCurrentFrame(): ReplayFrame<TState> | null {
    return this.frames[this.currentFrame] ?? null;
  }

  /**
   * Advance to next frame
   */
  next(): ReplayFrame<TState> | null {
    if (this.currentFrame < this.frames.length - 1) {
      this.currentFrame++;
    }
    return this.getCurrentFrame();
  }

  /**
   * Go to previous frame
   */
  previous(): ReplayFrame<TState> | null {
    if (this.currentFrame > 0) {
      this.currentFrame--;
    }
    return this.getCurrentFrame();
  }

  /**
   * Jump to specific frame
   */
  jumpTo(tick: number): ReplayFrame<TState> | null {
    if (tick >= 0 && tick < this.frames.length) {
      this.currentFrame = tick;
    }
    return this.getCurrentFrame();
  }

  /**
   * Get total frame count
   */
  getFrameCount(): number {
    return this.frames.length;
  }

  /**
   * Export replay data
   */
  export(): string {
    return JSON.stringify({
      frames: this.frames,
      totalFrames: this.frames.length,
    }, null, 2);
  }

  /**
   * Search for frames where predicate is true
   */
  search(predicate: (frame: ReplayFrame<TState>) => boolean): ReplayFrame<TState>[] {
    return this.frames.filter(predicate);
  }
}
