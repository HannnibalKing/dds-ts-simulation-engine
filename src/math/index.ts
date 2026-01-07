/**
 * Math subsystem exports
 * 
 * CRITICAL: All simulation arithmetic must use these deterministic functions.
 * Never import JavaScript's Math object in simulation code.
 */

export { FixedMath, FIXED_ONE, FIXED_SHIFT, FIXED_PI, FIXED_E, FIXED_HALF } from './fixed.js';
export type { Fixed } from './fixed.js';
export { Vec2Math, Vec3Math } from './vector.js';
export type { Vec2, Vec3 } from './vector.js';
