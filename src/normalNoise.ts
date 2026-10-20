/**
 * Minecraft Java 版 1.21.1 的 NormalNoise 的 TypeScript 移植。
 *
 * NormalNoise 是地形噪声的最外层封装：
 *   - 两个 PerlinNoise（first / second），第二个在采样时把坐标乘 1.0181268882175227，
 *     让两组噪声不完全相关；
 *   - 相加后乘 valueFactor 归一化；
 *   - valueFactor 由 expectedDeviation(octave 跨度) 决定。
 *
 * 说明：MC 的 PerlinNoise.create 走 PositionalRandomFactory 的 fromHashOf 分支；
 * 这里为了和 demo 的 LegacyRandomSource 对齐，用的是 PerlinNoise 的旧构造分支。
 * 结构、公式和采样偏移一致，但不保证与 MC 逐位相同。
 */
import PerlinNoise from './perlinNoise'
import type { RandomSource } from './legacyRandomSource'

const COORDINATE_SCALE = 1.0181268882175227

export class NoiseParameters {
  constructor(
    readonly firstOctave: number,
    readonly amplitudes: number[]
  ) {}
}

export default class NormalNoise {
  private readonly valueFactor: number
  private readonly first: PerlinNoise
  private readonly second: PerlinNoise
  private readonly maxValueRaw: number
  readonly parameters: NoiseParameters

  static create(
    random: RandomSource,
    firstOctave: number,
    ...amplitudes: number[]
  ): NormalNoise {
    return new NormalNoise(
      random,
      new NoiseParameters(firstOctave, amplitudes),
      true
    )
  }

  static createWith(
    random: RandomSource,
    parameters: NoiseParameters
  ): NormalNoise {
    return new NormalNoise(random, parameters, true)
  }

  constructor(
    random: RandomSource,
    parameters: NoiseParameters,
    _useLegacyNetherBiome = true
  ) {
    this.parameters = parameters
    this.first = new PerlinNoise(
      random,
      parameters.firstOctave,
      parameters.amplitudes
    )
    this.second = new PerlinNoise(
      random,
      parameters.firstOctave,
      parameters.amplitudes
    )

    let minOctave = Number.MAX_SAFE_INTEGER
    let maxOctave = Number.MIN_SAFE_INTEGER
    parameters.amplitudes.forEach((amplitude, index) => {
      if (amplitude !== 0) {
        minOctave = Math.min(minOctave, index)
        maxOctave = Math.max(maxOctave, index)
      }
    })

    this.valueFactor =
      0.16666666666666666 / expectedDeviation(maxOctave - minOctave)
    this.maxValueRaw =
      (this.first.maxValue + this.second.maxValue) * this.valueFactor
  }

  maxValue(): number {
    return this.maxValueRaw
  }

  getValue(x: number, y: number, z: number): number {
    const sx = x * COORDINATE_SCALE
    const sy = y * COORDINATE_SCALE
    const sz = z * COORDINATE_SCALE
    return (
      (this.first.getValue(x, y, z) + this.second.getValue(sx, sy, sz)) *
      this.valueFactor
    )
  }
}

function expectedDeviation(octaves: number): number {
  return 0.1 * (1 + 1 / (octaves + 1))
}
