import { FixedMath, Fixed, FIXED_ONE } from './fixed.js';

/**
 * 2D Vector using fixed-point math
 */
export interface Vec2 {
  readonly x: Fixed;
  readonly y: Fixed;
}

/**
 * 3D Vector using fixed-point math
 */
export interface Vec3 {
  readonly x: Fixed;
  readonly y: Fixed;
  readonly z: Fixed;
}

/**
 * Deterministic 2D vector operations
 */
export class Vec2Math {
  static create(x: Fixed, y: Fixed): Vec2 {
    return { x, y };
  }

  static zero(): Vec2 {
    return { x: 0n, y: 0n };
  }

  static add(a: Vec2, b: Vec2): Vec2 {
    return {
      x: FixedMath.add(a.x, b.x),
      y: FixedMath.add(a.y, b.y),
    };
  }

  static sub(a: Vec2, b: Vec2): Vec2 {
    return {
      x: FixedMath.sub(a.x, b.x),
      y: FixedMath.sub(a.y, b.y),
    };
  }

  static mul(v: Vec2, scalar: Fixed): Vec2 {
    return {
      x: FixedMath.mul(v.x, scalar),
      y: FixedMath.mul(v.y, scalar),
    };
  }

  static dot(a: Vec2, b: Vec2): Fixed {
    return FixedMath.add(
      FixedMath.mul(a.x, b.x),
      FixedMath.mul(a.y, b.y)
    );
  }

  static lengthSquared(v: Vec2): Fixed {
    return Vec2Math.dot(v, v);
  }

  static length(v: Vec2): Fixed {
    return FixedMath.sqrt(Vec2Math.lengthSquared(v));
  }

  static normalize(v: Vec2): Vec2 {
    const len = Vec2Math.length(v);
    if (len === 0n) return Vec2Math.zero();
    return {
      x: FixedMath.div(v.x, len),
      y: FixedMath.div(v.y, len),
    };
  }

  static distance(a: Vec2, b: Vec2): Fixed {
    return Vec2Math.length(Vec2Math.sub(a, b));
  }

  static angle(v: Vec2): Fixed {
    return FixedMath.atan2(v.y, v.x);
  }

  static rotate(v: Vec2, angle: Fixed): Vec2 {
    const cos = FixedMath.cos(angle);
    const sin = FixedMath.sin(angle);
    return {
      x: FixedMath.sub(
        FixedMath.mul(v.x, cos),
        FixedMath.mul(v.y, sin)
      ),
      y: FixedMath.add(
        FixedMath.mul(v.x, sin),
        FixedMath.mul(v.y, cos)
      ),
    };
  }
}

/**
 * Deterministic 3D vector operations
 */
export class Vec3Math {
  static create(x: Fixed, y: Fixed, z: Fixed): Vec3 {
    return { x, y, z };
  }

  static zero(): Vec3 {
    return { x: 0n, y: 0n, z: 0n };
  }

  static add(a: Vec3, b: Vec3): Vec3 {
    return {
      x: FixedMath.add(a.x, b.x),
      y: FixedMath.add(a.y, b.y),
      z: FixedMath.add(a.z, b.z),
    };
  }

  static sub(a: Vec3, b: Vec3): Vec3 {
    return {
      x: FixedMath.sub(a.x, b.x),
      y: FixedMath.sub(a.y, b.y),
      z: FixedMath.sub(a.z, b.z),
    };
  }

  static mul(v: Vec3, scalar: Fixed): Vec3 {
    return {
      x: FixedMath.mul(v.x, scalar),
      y: FixedMath.mul(v.y, scalar),
      z: FixedMath.mul(v.z, scalar),
    };
  }

  static dot(a: Vec3, b: Vec3): Fixed {
    return FixedMath.add(
      FixedMath.add(
        FixedMath.mul(a.x, b.x),
        FixedMath.mul(a.y, b.y)
      ),
      FixedMath.mul(a.z, b.z)
    );
  }

  static cross(a: Vec3, b: Vec3): Vec3 {
    return {
      x: FixedMath.sub(
        FixedMath.mul(a.y, b.z),
        FixedMath.mul(a.z, b.y)
      ),
      y: FixedMath.sub(
        FixedMath.mul(a.z, b.x),
        FixedMath.mul(a.x, b.z)
      ),
      z: FixedMath.sub(
        FixedMath.mul(a.x, b.y),
        FixedMath.mul(a.y, b.x)
      ),
    };
  }

  static lengthSquared(v: Vec3): Fixed {
    return Vec3Math.dot(v, v);
  }

  static length(v: Vec3): Fixed {
    return FixedMath.sqrt(Vec3Math.lengthSquared(v));
  }

  static normalize(v: Vec3): Vec3 {
    const len = Vec3Math.length(v);
    if (len === 0n) return Vec3Math.zero();
    return {
      x: FixedMath.div(v.x, len),
      y: FixedMath.div(v.y, len),
      z: FixedMath.div(v.z, len),
    };
  }

  static distance(a: Vec3, b: Vec3): Fixed {
    return Vec3Math.length(Vec3Math.sub(a, b));
  }
}
