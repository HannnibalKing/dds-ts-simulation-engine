/**
 * State differ for debugging divergence
 */

import type { CanonicalData } from '../core/state.js';
import { StateSerializer } from '../core/state.js';

/**
 * Diff result
 */
export interface DiffResult {
  readonly path: string;
  readonly leftValue: unknown;
  readonly rightValue: unknown;
  readonly type: 'added' | 'removed' | 'changed';
}

/**
 * State differ
 */
export class StateDiffer {
  /**
   * Find differences between two states
   */
  diff(left: CanonicalData, right: CanonicalData): DiffResult[] {
    return this.diffRecursive(left, right, '');
  }

  private diffRecursive(
    left: CanonicalData,
    right: CanonicalData,
    path: string
  ): DiffResult[] {
    const results: DiffResult[] = [];

    // Type mismatch
    if (typeof left !== typeof right) {
      results.push({
        path,
        leftValue: left,
        rightValue: right,
        type: 'changed',
      });
      return results;
    }

    // Primitive values
    if (left !== right && (
      typeof left !== 'object' || left === null || right === null
    )) {
      results.push({
        path,
        leftValue: left,
        rightValue: right,
        type: 'changed',
      });
      return results;
    }

    // Arrays
    if (Array.isArray(left) && Array.isArray(right)) {
      const maxLength = Math.max(left.length, right.length);
      
      for (let i = 0; i < maxLength; i++) {
        const itemPath = `${path}[${i}]`;
        
        if (i >= left.length) {
          results.push({
            path: itemPath,
            leftValue: undefined,
            rightValue: right[i],
            type: 'added',
          });
        } else if (i >= right.length) {
          results.push({
            path: itemPath,
            leftValue: left[i],
            rightValue: undefined,
            type: 'removed',
          });
        } else {
          results.push(...this.diffRecursive(left[i]!, right[i]!, itemPath));
        }
      }
      
      return results;
    }

    // Objects
    if (typeof left === 'object' && typeof right === 'object' && left !== null && right !== null) {
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      const allKeys = new Set([...leftKeys, ...rightKeys]);

      for (const key of allKeys) {
        const keyPath = path ? `${path}.${key}` : key;
        const leftValue = (left as Record<string, CanonicalData>)[key];
        const rightValue = (right as Record<string, CanonicalData>)[key];

        if (leftValue === undefined) {
          results.push({
            path: keyPath,
            leftValue: undefined,
            rightValue,
            type: 'added',
          });
        } else if (rightValue === undefined) {
          results.push({
            path: keyPath,
            leftValue,
            rightValue: undefined,
            type: 'removed',
          });
        } else {
          results.push(...this.diffRecursive(leftValue, rightValue, keyPath));
        }
      }
    }

    return results;
  }

  /**
   * Format diff results as readable text
   */
  format(diffs: DiffResult[]): string {
    if (diffs.length === 0) {
      return 'No differences found';
    }

    const lines: string[] = [];
    lines.push(`Found ${diffs.length} difference(s):`);
    lines.push('');

    for (const diff of diffs) {
      switch (diff.type) {
        case 'added':
          lines.push(`+ ${diff.path}: ${JSON.stringify(diff.rightValue)}`);
          break;
        case 'removed':
          lines.push(`- ${diff.path}: ${JSON.stringify(diff.leftValue)}`);
          break;
        case 'changed':
          lines.push(`! ${diff.path}:`);
          lines.push(`  - ${JSON.stringify(diff.leftValue)}`);
          lines.push(`  + ${JSON.stringify(diff.rightValue)}`);
          break;
      }
    }

    return lines.join('\n');
  }

  /**
   * Compare serialized bytes
   */
  comparBytes(left: CanonicalData, right: CanonicalData): {
    match: boolean;
    divergencePoint?: number;
    leftBytes: Uint8Array;
    rightBytes: Uint8Array;
  } {
    const serializer = new StateSerializer();
    const leftBytes = serializer.serialize(left);
    const rightBytes = serializer.serialize(right);

    const minLength = Math.min(leftBytes.length, rightBytes.length);
    let divergencePoint: number | undefined;

    for (let i = 0; i < minLength; i++) {
      if (leftBytes[i] !== rightBytes[i]) {
        divergencePoint = i;
        break;
      }
    }

    if (divergencePoint === undefined && leftBytes.length !== rightBytes.length) {
      divergencePoint = minLength;
    }

    return {
      match: divergencePoint === undefined,
      divergencePoint,
      leftBytes,
      rightBytes,
    };
  }
}
