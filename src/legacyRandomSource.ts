/**
 * Minecraft Java 版 1.21.1 的 LegacyRandomSource 的 TypeScript 移植。
 *
 * 世界种子走的就是这条路径：一个 48 位的线性同余发生器（LCG）：
 *   seed = (seed * 25214903917 + 11) & ((1 << 48) - 1)
 *
 * 另一个常用的实现是 XoroshiroRandomSource（更新的世界生成随机数），
 * ImprovedNoise 只依赖 RandomSource 接口，不关心具体是哪一个。
 */

export interface RandomSource {
  nextInt(bound: number): number
  nextDouble(): number
  consumeCount(count: number): void
}

const MULTIPLIER = 25214903917n
const INCREMENT = 11n
const MODULUS_MASK = 281474976710655n // (1 << 48) - 1
const DOUBLE_UNIT = 1.1102230246251565e-16 // 1 / 2^53（源码写作 1.110223E-16F）

export default class LegacyRandomSource implements RandomSource {
  private seed: bigint

  constructor(seed: number | bigint) {
    this.seed = (BigInt(seed) ^ MULTIPLIER) & MODULUS_MASK
  }

  /** 对应 Java 的 next(bits)：取高 bits 位 */
  private next(bits: number): number {
    this.seed = (this.seed * MULTIPLIER + INCREMENT) & MODULUS_MASK
    return Number(this.seed >> BigInt(48 - bits))
  }

  nextInt(bound: number): number {
    if (bound <= 0) {
      throw new Error('bound must be positive')
    }

    // 2 的幂：Java 版直接用一次 31 位随机数缩放
    if ((bound & -bound) === bound) {
      return Math.floor((bound * this.next(31)) / 2147483648)
    }

    let i: number
    let j: number
    do {
      i = this.next(31)
      j = i % bound
    } while (i - j + (bound - 1) >= 2147483648)

    return j
  }

  nextDouble(): number {
    return (
      (this.next(26) * 134217728 + this.next(27)) * DOUBLE_UNIT
    )
  }

  /** 对应 RandomSource.consumeCount：消耗 count 个 32 位随机数 */
  consumeCount(count: number): void {
    for (let i = 0; i < count; i++) this.next(32)
  }
}
