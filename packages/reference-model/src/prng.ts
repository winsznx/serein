/**
 * Deterministic randomness for the reference model.
 *
 * This exists so a scenario corpus is byte-identical on every machine and in CI.
 * It is a test fixture, not a security primitive: the protocol's live randomness
 * comes from `FHE.randEuint128`, which is produced by the Zama coprocessor's
 * CSPRNG and never leaves ciphertext form.
 */

import { createHash } from "node:crypto";

const MASK_64 = (1n << 64n) - 1n;

/** splitmix64 — small, fast, and identical across implementations. */
export class Prng {
  private state: bigint;

  constructor(seed: string | bigint) {
    if (typeof seed === "bigint") {
      this.state = seed & MASK_64;
    } else {
      const digest = createHash("sha256").update(seed).digest();
      this.state = digest.readBigUInt64BE(0);
    }
  }

  nextUint64(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & MASK_64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
    return (z ^ (z >> 31n)) & MASK_64;
  }

  /** Uniform on [0, 2^bits). */
  nextBits(bits: number): bigint {
    if (bits <= 0) return 0n;
    let out = 0n;
    let produced = 0;
    while (produced < bits) {
      out = (out << 64n) | this.nextUint64();
      produced += 64;
    }
    return out & ((1n << BigInt(bits)) - 1n);
  }

  /**
   * Uniform on [0, bound). When `bound` is a power of two this is exact with a
   * single draw, which is the only shape the protocol actually uses.
   */
  nextBelow(bound: bigint): bigint {
    if (bound <= 0n) throw new RangeError("bound must be positive");
    const bits = bound.toString(2).length;
    if ((bound & (bound - 1n)) === 0n) return this.nextBits(bits - 1);
    // Rejection sampling for non-power-of-two bounds, used only by the scenario
    // generator when picking sizes and amounts.
    for (;;) {
      const candidate = this.nextBits(bits);
      if (candidate < bound) return candidate;
    }
  }

  /** Uniform integer on [min, max] inclusive. */
  nextRange(min: bigint, max: bigint): bigint {
    if (max < min) throw new RangeError("max must be >= min");
    return min + this.nextBelow(max - min + 1n);
  }

  nextInt(min: number, max: number): number {
    return Number(this.nextRange(BigInt(min), BigInt(max)));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("cannot pick from an empty array");
    return items[this.nextInt(0, items.length - 1)]!;
  }
}
