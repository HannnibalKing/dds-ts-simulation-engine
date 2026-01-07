/**
 * Canonical data types for deterministic serialization
 * 
 * RULES:
 * - No Maps, Sets, or any unordered structures
 * - All arrays must maintain stable iteration order
 * - All objects must serialize deterministically
 * - No Date, Symbol, or platform-specific types
 */

import type { Fixed } from '../math/index.js';

/**
 * Primitive types allowed in simulation state
 */
export type CanonicalPrimitive = 
  | bigint      // For Fixed and large integers
  | number      // Only for small integers, never for math
  | string      // UTF-8 strings
  | boolean     // true/false
  | null;

/**
 * Canonical array with stable ordering
 */
export type CanonicalArray = ReadonlyArray<CanonicalData>;

/**
 * Canonical object with sorted keys
 * 
 * CRITICAL: Keys are always iterated in sorted order during serialization
 */
export type CanonicalObject = {
  readonly [key: string]: CanonicalData;
};

/**
 * Complete canonical data type
 */
export type CanonicalData = 
  | CanonicalPrimitive
  | CanonicalArray
  | CanonicalObject;

/**
 * Canonical state serializer
 * 
 * Converts any CanonicalData into a deterministic byte array.
 * Same input ALWAYS produces identical bytes across all platforms.
 */
export class StateSerializer {
  private encoder = new TextEncoder();
  private buffer: number[] = [];

  /**
   * Serialize canonical data to Uint8Array
   */
  serialize(data: CanonicalData): Uint8Array {
    this.buffer = [];
    this.writeValue(data);
    return new Uint8Array(this.buffer);
  }

  private writeValue(value: CanonicalData): void {
    if (value === null) {
      this.writeByte(0x00); // NULL marker
    } else if (typeof value === 'boolean') {
      this.writeByte(value ? 0x01 : 0x02); // TRUE/FALSE markers
    } else if (typeof value === 'bigint') {
      this.writeByte(0x03); // BIGINT marker
      this.writeBigInt(value);
    } else if (typeof value === 'number') {
      this.writeByte(0x04); // NUMBER marker
      this.writeNumber(value);
    } else if (typeof value === 'string') {
      this.writeByte(0x05); // STRING marker
      this.writeString(value);
    } else if (Array.isArray(value)) {
      this.writeByte(0x06); // ARRAY marker
      this.writeArray(value);
    } else if (typeof value === 'object' && value !== null) {
      this.writeByte(0x07); // OBJECT marker
      this.writeObject(value as CanonicalObject);
    } else {
      throw new Error(`Cannot serialize type: ${typeof value}`);
    }
  }

  private writeByte(byte: number): void {
    this.buffer.push(byte & 0xFF);
  }

  private writeBigInt(value: bigint): void {
    // Convert to two's complement byte representation
    const isNegative = value < 0n;
    let abs = isNegative ? -value : value;
    
    const bytes: number[] = [];
    if (abs === 0n) {
      bytes.push(0);
    } else {
      while (abs > 0n) {
        bytes.push(Number(abs & 0xFFn));
        abs >>= 8n;
      }
    }

    // Write sign and length
    this.writeByte(isNegative ? 1 : 0);
    this.writeVarInt(bytes.length);
    
    // Write bytes (little-endian)
    for (const byte of bytes) {
      this.writeByte(byte);
    }
  }

  private writeNumber(value: number): void {
    // CRITICAL: Only use for integers, never for float arithmetic
    if (!Number.isInteger(value)) {
      throw new Error('Floating-point numbers not allowed in state');
    }
    
    // Convert to 32-bit signed integer
    const view = new DataView(new ArrayBuffer(4));
    view.setInt32(0, value, true); // little-endian
    
    for (let i = 0; i < 4; i++) {
      this.writeByte(view.getUint8(i));
    }
  }

  private writeString(value: string): void {
    const bytes = this.encoder.encode(value);
    this.writeVarInt(bytes.length);
    for (const byte of bytes) {
      this.writeByte(byte);
    }
  }

  private writeArray(value: CanonicalArray): void {
    this.writeVarInt(value.length);
    for (const item of value) {
      this.writeValue(item);
    }
  }

  private writeObject(value: CanonicalObject): void {
    // CRITICAL: Sort keys for determinism
    const keys = Object.keys(value).sort();
    this.writeVarInt(keys.length);
    
    for (const key of keys) {
      this.writeString(key);
      this.writeValue(value[key]!);
    }
  }

  private writeVarInt(value: number): void {
    // Variable-length integer encoding (LEB128)
    if (value < 0) {
      throw new Error('VarInt must be non-negative');
    }
    
    do {
      let byte = value & 0x7F;
      value >>= 7;
      if (value !== 0) {
        byte |= 0x80; // More bytes to come
      }
      this.writeByte(byte);
    } while (value !== 0);
  }
}

/**
 * Deserialize canonical data from bytes
 */
export class StateDeserializer {
  private decoder = new TextDecoder();
  private buffer: Uint8Array;
  private offset = 0;

  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
  }

  deserialize(): CanonicalData {
    this.offset = 0;
    return this.readValue();
  }

  private readValue(): CanonicalData {
    const marker = this.readByte();
    
    switch (marker) {
      case 0x00: return null;
      case 0x01: return true;
      case 0x02: return false;
      case 0x03: return this.readBigInt();
      case 0x04: return this.readNumber();
      case 0x05: return this.readString();
      case 0x06: return this.readArray();
      case 0x07: return this.readObject();
      default:
        throw new Error(`Unknown type marker: 0x${marker.toString(16)}`);
    }
  }

  private readByte(): number {
    if (this.offset >= this.buffer.length) {
      throw new Error('Unexpected end of buffer');
    }
    return this.buffer[this.offset++]!;
  }

  private readBigInt(): bigint {
    const isNegative = this.readByte() === 1;
    const length = this.readVarInt();
    
    let value = 0n;
    for (let i = 0; i < length; i++) {
      value |= BigInt(this.readByte()) << BigInt(i * 8);
    }
    
    return isNegative ? -value : value;
  }

  private readNumber(): number {
    const view = new DataView(new ArrayBuffer(4));
    for (let i = 0; i < 4; i++) {
      view.setUint8(i, this.readByte());
    }
    return view.getInt32(0, true);
  }

  private readString(): string {
    const length = this.readVarInt();
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = this.readByte();
    }
    return this.decoder.decode(bytes);
  }

  private readArray(): CanonicalArray {
    const length = this.readVarInt();
    const result: CanonicalData[] = [];
    for (let i = 0; i < length; i++) {
      result.push(this.readValue());
    }
    return result;
  }

  private readObject(): CanonicalObject {
    const length = this.readVarInt();
    const result: { [key: string]: CanonicalData } = {};
    
    for (let i = 0; i < length; i++) {
      const key = this.readString();
      const value = this.readValue();
      result[key] = value;
    }
    
    return result;
  }

  private readVarInt(): number {
    let result = 0;
    let shift = 0;
    
    while (true) {
      const byte = this.readByte();
      result |= (byte & 0x7F) << shift;
      
      if ((byte & 0x80) === 0) {
        break;
      }
      
      shift += 7;
      if (shift >= 32) {
        throw new Error('VarInt too large');
      }
    }
    
    return result;
  }
}

/**
 * Helper to convert simulation state to canonical form
 */
export function toCanonical(value: unknown): CanonicalData {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'bigint') {
    return value;
  }
  
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error('Floating-point numbers not allowed in canonical state');
    }
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map(toCanonical);
  }
  
  if (typeof value === 'object') {
    const result: { [key: string]: CanonicalData } = {};
    for (const key of Object.keys(value)) {
      result[key] = toCanonical((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  
  throw new Error(`Cannot convert to canonical: ${typeof value}`);
}
