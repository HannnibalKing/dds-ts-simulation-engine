/**
 * Fixed-point Q32.32 number representation
 * 
 * CRITICAL: This type is used for all arithmetic in the simulation core.
 * Never use JavaScript floating-point numbers directly in simulation logic.
 * 
 * Format: 64-bit integer where:
 * - Upper 32 bits = integer part
 * - Lower 32 bits = fractional part
 * 
 * Represented as bigint in JavaScript for exact arithmetic.
 */
export type Fixed = bigint;

/**
 * Fixed-point math constants
 */
export const FIXED_SHIFT = 32n;
export const FIXED_ONE = 1n << FIXED_SHIFT;  // 1.0 in Q32.32
export const FIXED_HALF = FIXED_ONE >> 1n;   // 0.5 in Q32.32
export const FIXED_PI = 13493037705n;        // π ≈ 3.14159265359 in Q32.32
export const FIXED_E = 11674931555n;         // e ≈ 2.71828182846 in Q32.32

/**
 * Deterministic Math Library
 * 
 * All operations guarantee bitwise-identical results across:
 * - Different hardware (Intel, ARM, RISC-V)
 * - Different JavaScript engines (V8, SpiderMonkey, JavaScriptCore)
 * - Different platforms (browser, Node.js, Deno, Bun)
 * 
 * RULES:
 * - No Math.* functions (non-deterministic rounding)
 * - No floating-point operations
 * - All arithmetic uses bigint
 * - Results must be verifiable with checksums
 */
export class FixedMath {
  /**
   * Convert integer to fixed-point
   */
  static fromInt(n: number): Fixed {
    if (!Number.isInteger(n)) {
      throw new Error('fromInt requires integer input');
    }
    return BigInt(n) << FIXED_SHIFT;
  }

  /**
   * Convert fixed-point to integer (truncates)
   */
  static toInt(f: Fixed): number {
    return Number(f >> FIXED_SHIFT);
  }

  /**
   * Convert float to fixed-point (use only for initialization, never in simulation)
   * @deprecated Use only for test setup, never in simulation logic
   */
  static fromFloat(n: number): Fixed {
    return BigInt(Math.floor(n * Number(FIXED_ONE)));
  }

  /**
   * Convert fixed-point to float (for display only, never use in simulation)
   * @deprecated Use only for debugging/display, never in simulation logic
   */
  static toFloat(f: Fixed): number {
    return Number(f) / Number(FIXED_ONE);
  }

  /**
   * Addition: a + b
   */
  static add(a: Fixed, b: Fixed): Fixed {
    return a + b;
  }

  /**
   * Subtraction: a - b
   */
  static sub(a: Fixed, b: Fixed): Fixed {
    return a - b;
  }

  /**
   * Multiplication: a × b
   * 
   * Must shift right by FIXED_SHIFT to maintain Q32.32 format:
   * (a × b) >> 32
   */
  static mul(a: Fixed, b: Fixed): Fixed {
    return (a * b) >> FIXED_SHIFT;
  }

  /**
   * Division: a ÷ b
   * 
   * Must shift left before dividing to maintain Q32.32 format:
   * (a << 32) ÷ b
   */
  static div(a: Fixed, b: Fixed): Fixed {
    if (b === 0n) {
      throw new Error('Division by zero');
    }
    return (a << FIXED_SHIFT) / b;
  }

  /**
   * Absolute value: |a|
   */
  static abs(a: Fixed): Fixed {
    return a < 0n ? -a : a;
  }

  /**
   * Minimum: min(a, b)
   */
  static min(a: Fixed, b: Fixed): Fixed {
    return a < b ? a : b;
  }

  /**
   * Maximum: max(a, b)
   */
  static max(a: Fixed, b: Fixed): Fixed {
    return a > b ? a : b;
  }

  /**
   * Clamp: clamp(x, min, max)
   */
  static clamp(x: Fixed, min: Fixed, max: Fixed): Fixed {
    if (x < min) return min;
    if (x > max) return max;
    return x;
  }

  /**
   * Square root using Newton-Raphson method
   * 
   * Deterministic iteration count ensures identical results.
   */
  static sqrt(x: Fixed): Fixed {
    if (x < 0n) {
      throw new Error('sqrt of negative number');
    }
    if (x === 0n) return 0n;

    // Initial guess: x / 2
    let z = x >> 1n;
    if (z === 0n) z = 1n;

    // Newton-Raphson: z_next = (z + x/z) / 2
    // Fixed iterations for determinism
    for (let i = 0; i < 20; i++) {
      const zNext = (z + FixedMath.div(x, z)) >> 1n;
      if (zNext === z) break;
      z = zNext;
    }

    return z;
  }

  /**
   * Sine using Taylor series
   * 
   * sin(x) = x - x³/3! + x⁵/5! - x⁷/7! + ...
   * 
   * Input range: [-2π, 2π]
   * Fixed iteration count for determinism
   */
  static sin(x: Fixed): Fixed {
    // Normalize to [-π, π]
    const twoPi = FIXED_PI << 1n;
    x = x % twoPi;
    if (x > FIXED_PI) x -= twoPi;
    if (x < -FIXED_PI) x += twoPi;

    let result = x;
    let term = x;
    const x2 = FixedMath.mul(x, x);

    // Taylor series: fixed 10 terms for determinism
    for (let i = 1; i < 10; i++) {
      term = FixedMath.mul(term, x2);
      term = -FixedMath.div(term, FixedMath.fromInt((2 * i) * (2 * i + 1)));
      result = FixedMath.add(result, term);
    }

    return result;
  }

  /**
   * Cosine: cos(x) = sin(x + π/2)
   */
  static cos(x: Fixed): Fixed {
    return FixedMath.sin(x + (FIXED_PI >> 1n));
  }

  /**
   * Arctangent2: atan2(y, x)
   * 
   * Uses CORDIC algorithm for deterministic results
   */
  static atan2(y: Fixed, x: Fixed): Fixed {
    if (x === 0n && y === 0n) return 0n;

    // CORDIC iteration table (pre-computed arctangents)
    const angles = [
      2949120303n,  // atan(2^0)  ≈ 0.785398163
      1740992709n,  // atan(2^-1) ≈ 0.463647609
      919879896n,   // atan(2^-2) ≈ 0.244978663
      466945229n,   // atan(2^-3) ≈ 0.124354995
      234379596n,   // atan(2^-4) ≈ 0.062418810
      117304379n,   // atan(2^-5) ≈ 0.031239833
      58662403n,    // atan(2^-6) ≈ 0.015623729
      29332709n,    // atan(2^-7) ≈ 0.007812341
    ];

    let xCord = FIXED_ONE;
    let yCord = 0n;
    let angle = 0n;

    // Rotate into first quadrant
    let quadrantAngle = 0n;
    if (x < 0n) {
      if (y < 0n) {
        quadrantAngle = -FIXED_PI;
      } else {
        quadrantAngle = FIXED_PI;
      }
      x = -x;
      y = -y;
    }

    // CORDIC iterations
    for (let i = 0; i < angles.length; i++) {
      const xNew = yCord < 0n
        ? xCord - (yCord >> BigInt(i))
        : xCord + (yCord >> BigInt(i));
      const yNew = yCord < 0n
        ? yCord + (xCord >> BigInt(i))
        : yCord - (xCord >> BigInt(i));
      const angleNew = yCord < 0n
        ? angle - angles[i]!
        : angle + angles[i]!;

      xCord = xNew;
      yCord = yNew;
      angle = angleNew;
    }

    return angle + quadrantAngle;
  }

  /**
   * Compare two fixed-point numbers
   * Returns: -1 if a < b, 0 if a == b, 1 if a > b
   */
  static compare(a: Fixed, b: Fixed): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /**
   * Floor: largest integer ≤ x
   */
  static floor(x: Fixed): Fixed {
    return (x >> FIXED_SHIFT) << FIXED_SHIFT;
  }

  /**
   * Ceiling: smallest integer ≥ x
   */
  static ceil(x: Fixed): Fixed {
    const mask = FIXED_ONE - 1n;
    if ((x & mask) === 0n) return x;
    return ((x >> FIXED_SHIFT) + 1n) << FIXED_SHIFT;
  }
}
