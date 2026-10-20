/**
 * 四种“世界高度”生成方式
 * ======================
 * 高度坐标对齐 Java 版 1.21.1 的主世界：
 *   Y 从 -64 到 320，海平面 63。
 * 所有模式都返回这个范围内的整数，并且对同一个 (x,z,seed) 完全可复现。
 *
 * 注意：这里用“哈希随机”而不是 Math.random()，否则每次重绘、刷新页面，
 * 地形都会变，既没法对比截图，也没法做存档。
 */
import LegacyRandomSource from './legacyRandomSource'
import ImprovedNoise from './improvedNoise'
import PerlinNoise from './perlinNoise'
import NormalNoise from './normalNoise'

/** 演示世界的边长（方块数） */
export const WORLD_SIZE = 96
/** 主世界最低 Y（基岩层） */
export const MIN_Y = -64
/** 主世界最高 Y（建造上限） */
export const MAX_Y = 320
/** 海平面 */
export const SEA_LEVEL = 63

export const MODES = [
  'random',
  'smooth',
  'value',
  'perlin',
  'octaves',
  'normal'
] as const
export type HeightMode = (typeof MODES)[number]

export interface HeightGenerator {
  mode: HeightMode
  title: string
  formula: string
  hint: string
  height: (x: number, z: number) => number
}

/** 文章配图用的隐藏参数；正常 demo 不传 */
export interface GeneratorOptions {
  firstOctave?: number
  amplitudes?: number[]
  octaveOnly?: number | 'sum'
  componentScale?: number
  layers?: 1 | 2
}

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * 32 位整数哈希 → [0, 1)。
 * 作用相当于“每个晶格点独立掷一次骰子”，但同一个坐标永远得到同一个结果。
 */
export const hash01 = (x: number, z: number, seed: number) => {
  let h =
    Math.imul(x | 0, 374761393) +
    Math.imul(z | 0, 668265263) +
    Math.imul(seed | 0, 1442695041)

  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16

  return (h >>> 0) / 4294967296
}

/**
 * 值噪声：随机晶格 + 双线性插值。
 * 故意只用线性插值（不抹平），这样能清楚看到晶格边界处的折线。
 */
export const valueNoise = (x: number, z: number, seed: number) => {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi

  const v00 = hash01(xi, zi, seed)
  const v10 = hash01(xi + 1, zi, seed)
  const v01 = hash01(xi, zi + 1, seed)
  const v11 = hash01(xi + 1, zi + 1, seed)

  return lerp(lerp(v00, v10, xf), lerp(v01, v11, xf), zf)
}

export const createGenerator = (
  mode: HeightMode,
  seed: number,
  options: GeneratorOptions = {}
): HeightGenerator => {
  switch (mode) {
    case 'random':
      return {
        mode,
        title: '① 随机数（白噪声）',
        formula: 'h = 63 + (hash(x,z) − 0.5) × 60',
        hint: '每个晶格独立取值：相邻列毫无关系，地形像针山，根本走不了。',
        height: (x, z) =>
          clamp(
            SEA_LEVEL + Math.round((hash01(x, z, seed) - 0.5) * 60),
            MIN_Y,
            MAX_Y
          )
      }

    case 'smooth':
      return {
        mode,
        title: '② 正弦函数（平滑，但周期）',
        formula: 'h = 63 + 12·sin(0.2x) + 6·cos(0.2z)',
        hint: '斜率连续变化，看起来光滑；但它是周期函数，每一段都重复，仍然没有随机性。',
        height: (x, z) =>
          clamp(
            SEA_LEVEL +
              Math.round(12 * Math.sin(x * 0.2) + 6 * Math.cos(z * 0.2)),
            MIN_Y,
            MAX_Y
          )
      }

    case 'value': {
      const frequency = 0.08
      return {
        mode,
        title: '③ 值噪声（随机 + 线性插值）',
        formula: 'h = 63 + (valueNoise(x×0.08, z×0.08) − 0.5) × 48',
        hint: '随机晶格 + 线性插值：值连续，但晶格边界处斜率会跳，能看到折痕。',
        height: (x, z) =>
          clamp(
            SEA_LEVEL +
              Math.round(
                (valueNoise(x * frequency, z * frequency, seed) - 0.5) * 48
              ),
            MIN_Y,
            MAX_Y
          )
      }
    }

    case 'perlin': {
      const random = new LegacyRandomSource(seed)
      const improvedNoise = new ImprovedNoise(random)
      const frequency = 0.06

      return {
        mode,
        title: '④ 3D 噪声（ImprovedNoise）',
        formula: 'h = 63 + improvedNoise(x×0.06, 0, z×0.06) × 24',
        hint: 'MC 的 ImprovedNoise：3D 梯度噪声 + smoothstep + lerp3；这里取 y=0 的二维切片。',
        height: (x, z) =>
          clamp(
            SEA_LEVEL +
              Math.round(
                improvedNoise.noise(x * frequency, 0, z * frequency) * 24
              ),
            MIN_Y,
            MAX_Y
          )
      }
    }

    case 'octaves': {
      const amplitudes =
        options.amplitudes && options.amplitudes.length > 0
          ? options.amplitudes
          : [1, 0.7, 0.5]
      const firstOctave = options.firstOctave ?? -4
      const random = new LegacyRandomSource(seed)
      const perlin = PerlinNoise.create(
        random,
        firstOctave,
        amplitudes[0],
        ...amplitudes.slice(1)
      )

      if (typeof options.octaveOnly === 'number') {
        const index = options.octaveOnly
        const scale = options.componentScale ?? 120
        return {
          mode,
          title: `⑤ PerlinNoise · octave ${index}`,
          formula: `h = 63 + octave${index}(x, 0, z) × ${scale}`,
          hint: '单个 octave 的贡献；用于文章里的低频/中频/高频拆解图。',
          height: (x, z) =>
            clamp(
              SEA_LEVEL +
                Math.round(perlin.getOctaveValue(index, x, 0, z) * scale),
              MIN_Y,
              MAX_Y
            )
        }
      }

      return {
        mode,
        title: '⑤ 多八度柏林（PerlinNoise 3 octaves）',
        formula: 'h = 63 + perlinNoise(x, 0, z) × 50',
        hint: '把 3 个 ImprovedNoise 按 octave 叠起来：低频定大山，高频加细节。',
        height: (x, z) =>
          clamp(
            SEA_LEVEL + Math.round(perlin.getValue(x, 0, z) * 50),
            MIN_Y,
            MAX_Y
          )
      }
    }

    case 'normal': {
      const amplitudes =
        options.amplitudes && options.amplitudes.length > 0
          ? options.amplitudes
          : [1, 0.7, 0.5]

      if (options.layers === 1) {
        const random = new LegacyRandomSource(seed)
        const perlin = PerlinNoise.create(
          random,
          -4,
          amplitudes[0],
          ...amplitudes.slice(1)
        )
        return {
          mode,
          title: '⑥ NormalNoise（单层 Perlin 对照）',
          formula: 'h = 63 + perlinNoise(x, 0, z) × 30',
          hint: '只用一个 PerlinNoise，作为 NormalNoise 的对照。',
          height: (x, z) =>
            clamp(
              SEA_LEVEL + Math.round(perlin.getValue(x, 0, z) * 30),
              MIN_Y,
              MAX_Y
            )
        }
      }

      const random = new LegacyRandomSource(seed)
      const normal = NormalNoise.create(
        random,
        -4,
        amplitudes[0],
        ...amplitudes.slice(1)
      )

      return {
        mode,
        title: '⑥ 最终噪声（NormalNoise）',
        formula: 'h = 63 + normalNoise(x, 0, z) × 30',
        hint: '两个 PerlinNoise 相加、乘 1.018 偏移和 valueFactor；MC 地形的最外层噪声封装。',
        height: (x, z) =>
          clamp(
            SEA_LEVEL + Math.round(normal.getValue(x, 0, z) * 30),
            MIN_Y,
            MAX_Y
          )
      }
    }
  }
}
