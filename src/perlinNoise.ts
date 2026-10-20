/**
 * Minecraft Java 版 1.21.1 的 PerlinNoise 的 TypeScript 移植（旧构造分支）。
 *
 * 它把多个 ImprovedNoise 按 octave 叠起来：
 *   - 第 i 个 octave 的输入乘 2，输出除 2；
 *   - amplitudes[i] 控制每个 octave 的振幅；
 *   - firstOctave 决定最低频率（负数）。
 *
 * 1.18+ 的世界生成更多走 NormalNoise / DoublePerlinNoiseSampler；
 * 这里移植的是 PerlinNoise 自己的 octave 循环，用来看清“多八度”本身。
 */
import ImprovedNoise from './improvedNoise'
import type { RandomSource } from './legacyRandomSource'

export const wrap = (value: number) =>
  value - Math.floor(value / 33554432 + 0.5) * 33554432

export default class PerlinNoise {
  private readonly noiseLevels: (ImprovedNoise | null)[]
  readonly firstOctave: number
  readonly amplitudes: number[]
  readonly lowestFreqInputFactor: number
  readonly lowestFreqValueFactor: number
  readonly maxValue: number

  constructor(
    random: RandomSource,
    firstOctave: number,
    amplitudes: number[]
  ) {
    this.firstOctave = firstOctave
    this.amplitudes = amplitudes.slice()

    const count = this.amplitudes.length
    const j = -firstOctave
    this.noiseLevels = new Array<ImprovedNoise | null>(count).fill(null)

    // 旧分支：先创建一个 ImprovedNoise，再按需要 fork / skip
    const base = new ImprovedNoise(random)
    if (j >= 0 && j < count && this.amplitudes[j] !== 0) {
      this.noiseLevels[j] = base
    }

    for (let i = j - 1; i >= 0; i--) {
      if (i < count) {
        if (this.amplitudes[i] !== 0) {
          this.noiseLevels[i] = new ImprovedNoise(random)
        } else {
          this.skipOctave(random)
        }
      } else {
        this.skipOctave(random)
      }
    }

    const nonZero = this.amplitudes.filter(value => value !== 0).length
    const levels = this.noiseLevels.filter(Boolean).length
    if (levels !== nonZero) {
      throw new Error(
        'Failed to create correct number of noise levels for given non-zero amplitudes'
      )
    }
    if (j < count - 1) {
      throw new Error('Positive octaves are temporarily disabled')
    }

    this.lowestFreqInputFactor = Math.pow(2, -j)
    this.lowestFreqValueFactor =
      Math.pow(2, count - 1) / (Math.pow(2, count) - 1)
    this.maxValue = this.edgeValue(2)
  }

  static create(
    random: RandomSource,
    firstOctave: number,
    firstAmplitude: number,
    ...amplitudes: number[]
  ) {
    return new PerlinNoise(random, firstOctave, [
      firstAmplitude,
      ...amplitudes
    ])
  }

  getValue(x: number, y: number, z: number): number {
    let value = 0
    let input = this.lowestFreqInputFactor
    let output = this.lowestFreqValueFactor

    for (let i = 0; i < this.noiseLevels.length; i++) {
      const noise = this.noiseLevels[i]
      if (noise) {
        const sampled = noise.noise(wrap(x * input), wrap(y * input), wrap(z * input))
        value += this.amplitudes[i] * sampled * output
      }
      input *= 2
      output /= 2
    }

    return value
  }

  maxBrokenValue(yMultiplier: number): number {
    return this.edgeValue(yMultiplier + 2)
  }

  private edgeValue(multiplier: number): number {
    let value = 0
    let output = this.lowestFreqValueFactor

    for (let i = 0; i < this.noiseLevels.length; i++) {
      if (this.noiseLevels[i]) {
        value += this.amplitudes[i] * multiplier * output
      }
      output /= 2
    }

    return value
  }

  getOctaveNoise(octave: number): ImprovedNoise | null {
    return this.noiseLevels[this.noiseLevels.length - 1 - octave]
  }

  /** 第 index 个 octave 单独贡献的值（用于拆解图） */
  getOctaveValue(index: number, x: number, y: number, z: number): number {
    const noise = this.noiseLevels[index]
    if (!noise) return 0

    const input = this.lowestFreqInputFactor * Math.pow(2, index)
    const output = this.lowestFreqValueFactor / Math.pow(2, index)
    return (
      this.amplitudes[index] *
      noise.noise(wrap(x * input), wrap(y * input), wrap(z * input)) *
      output
    )
  }

  private skipOctave(random: RandomSource): void {
    random.consumeCount(262)
  }
}
